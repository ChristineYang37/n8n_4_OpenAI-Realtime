// realtime.v1.0.5.js
(async function(){
  console.log("✅ realtime.js 已加载");

  // —— 从 HTML 注入的全局变量读取 —— 
  const SECRET = window.OPENAI_SECRET;
  const MODEL  = window.OPENAI_MODEL;
  console.log("🔑 Injected secret/model:", SECRET, MODEL);

  // 聊天容器与音频播放元素
  const chatEl  = document.getElementById("chat");
  const audioEl = document.getElementById("agent-audio");

  // 缓存气泡元素
  const bubbles = {};

  // 创建或更新气泡
  function upsertBubble(itemId, clazz, text, done) {
    let div = bubbles[itemId];
    if (!div) {
      div = document.createElement('div');
      div.id = `item_${itemId}`;
      div.className = `bubble ${clazz}`;
      // 标签
      const lbl = document.createElement('div');
      lbl.className = 'label';
      lbl.textContent = clazz === 'user' ? 'You' : 'AI';
      // 文本
      const txt = document.createElement('div');
      txt.className = 'text';
      div.append(lbl, txt);
      chatEl.appendChild(div);
      bubbles[itemId] = div;
    }
    const txtEl = div.querySelector('.text');
    txtEl.textContent = text;
    if (done) div.classList.add('done');
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // 处理 AI 事件
  function processAiEvent(msg) {
    // AI 文字流
    if (msg.type === 'response.audio_transcript.delta' ||
        msg.type === 'response.content_part.delta') {
      const prev = bubbles[msg.item_id]?.querySelector('.text').textContent || '';
      upsertBubble(msg.item_id, 'agent', prev + msg.delta, false);
    }
    // AI 完整输出
    else if (msg.type === 'response.audio_transcript.done' ||
             msg.type === 'response.content_part.done' ||
             msg.type === 'response.output_item.done') {

      // 综合提取各种可能字段
      const text =
        msg.transcript
        ?? msg.part?.transcript
        ?? msg.response?.output?.[0]?.content?.[0]?.transcript
        ?? bubbles[msg.item_id]?.querySelector('.text').textContent
        ?? '';
      upsertBubble(msg.item_id, 'agent', text, true);
    }
  }

  try {
    // —— 创建 RTCPeerConnection —— 
    const pc = new RTCPeerConnection();
    console.log('🧊 RTCPeerConnection created');

    pc.onicecandidate = e => console.log('🧊 ICE candidate:', e.candidate);
    pc.oniceconnectionstatechange = () =>
      console.log('🌐 ICE state:', pc.iceConnectionState);
    pc.onconnectionstatechange = () =>
      console.log('🔗 Connection state:', pc.connectionState);

    // —— 建立 DataChannel —— 
    const dc = pc.createDataChannel('oai-events');
    dc.onopen = () => console.log('📡 Data channel open');
    dc.onmessage = e => {
      const msg = JSON.parse(e.data);

      // 用户转写事件
      if (msg.type === 'conversation.item.input_audio_transcription.delta') {
        upsertBubble(msg.item_id, 'user', msg.delta, false);
      }
      else if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        upsertBubble(msg.item_id, 'user', msg.transcript, true);
        // 延后处理 AI 事件，保证用户先渲染
        setTimeout(() => processAiEvent(msg), 0);
      }
      else {
        // 其他事件均交给 AI 处理
        processAiEvent(msg);
      }
    };

    // —— 音频轨道处理 —— 
    pc.ontrack = e => {
      console.log('▶️ Audio track received, playing');
      audioEl.srcObject = e.streams[0];
      audioEl.volume = 0.8;          // 音量
      audioEl.playbackRate = 0.7;   // 语速
      audioEl.play();
    };

    // —— 麦克风采集 —— 
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('🎤 Mic tracks:', micStream.getAudioTracks());
    micStream.getTracks().forEach(track => pc.addTrack(track, micStream));

    // —— SDP 握手：创建 offer 并发送至 Realtime API —— 
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log('📨 Offer created (length:', offer.sdp.length, ')');

    const res = await fetch(
      `https://api.openai.com/v1/realtime?model=${MODEL}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SECRET}`,
          'Content-Type':  'application/sdp'
        },
        body: offer.sdp,
      }
    );
    console.log('📡 Realtime API response status:', res.status);
    if (!res.ok) throw new Error(`Realtime API returned ${res.status}`);

    const answer = await res.text();
    console.log('📩 Received answer SDP (length:', answer.length, ')');
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    console.log('✅ SDP negotiation complete');
  }
  catch (err) {
    console.error('❌ WebRTC error', err);
    const errEl = document.createElement('pre');
    errEl.textContent = 'ERROR: ' + err;
    chatEl.appendChild(errEl);
  }
})();
