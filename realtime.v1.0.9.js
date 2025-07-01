// realtime.v1.0.6.js
(async function(){
  console.log("✅ realtime.js 已加载");

  // —— 从 HTML 注入的全局变量读取 —— 
  const SECRET = window.OPENAI_SECRET;
  const MODEL  = window.OPENAI_MODEL;
  console.log("🔑 Injected secret/model:", SECRET, MODEL);

  const chatEl  = document.getElementById("chat");
  const audioEl = document.getElementById("agent-audio");
  const bubbles = {};

  // 创建或更新气泡
  function upsertBubble(itemId, clazz, text, done) {
    let div = bubbles[itemId];
    if (!div) {
      div = document.createElement('div');
      div.id = `item_${itemId}`;
      div.className = `bubble ${clazz}`;
      const lbl = document.createElement('div');
      lbl.className = 'label';
      lbl.textContent = clazz === 'user' ? 'You' : 'AI';
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
    if (msg.type === 'response.audio_transcript.delta' ||
        msg.type === 'response.content_part.delta') {
      const prev = bubbles[msg.item_id]?.querySelector('.text').textContent || '';
      upsertBubble(msg.item_id, 'agent', prev + msg.delta, false);
    }
    else if (msg.type === 'response.audio_transcript.done' ||
             msg.type === 'response.content_part.done' ||
             msg.type === 'response.output_item.done') {
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
    const pc = new RTCPeerConnection();
    console.log('🧊 RTCPeerConnection created');

    pc.onicecandidate = e => console.log('🧊 ICE candidate:', e.candidate);
    pc.oniceconnectionstatechange = () =>
      console.log('🌐 ICE state:', pc.iceConnectionState);
    pc.onconnectionstatechange = () =>
      console.log('🔗 Connection state:', pc.connectionState);

    const dc = pc.createDataChannel('oai-events');
    dc.onopen = () => {
      console.log('📡 Data channel open');
      // —— 主动触发 AI 开场白 ——
      const startEvent = {
        type: 'response.create',
        response: {
          modalities: ['text','audio'],
          instructions: 'Hello! Welcome to our restaurant. May I take your order?'
        }
      };
      dc.send(JSON.stringify(startEvent));
    };
    dc.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'conversation.item.input_audio_transcription.delta') {
        upsertBubble(msg.item_id, 'user', msg.delta, false);
      }
      else if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        upsertBubble(msg.item_id, 'user', msg.transcript, true);
        setTimeout(() => processAiEvent(msg), 0);
      }
      else {
        processAiEvent(msg);
      }
    };

    pc.ontrack = e => {
      console.log('▶️ Audio track received, playing');
      audioEl.srcObject = e.streams[0];
      audioEl.volume = 0.8;
      audioEl.playbackRate = 0.75;
      audioEl.play();
    };

    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('🎤 Mic tracks:', micStream.getAudioTracks());
    micStream.getTracks().forEach(track => pc.addTrack(track, micStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log('📨 Offer created (length:', offer.sdp.length, ')');

    const res = await fetch(
      `https://api.openai.com/v1/realtime?model=${MODEL}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      }
    );
    console.log('📡 Realtime API response status:', res.status);
    if (!res.ok) throw new Error(`Realtime API returned ${res.status}`);

    const answer = await res.text();
    console.log('📩 Received answer SDP (length:', answer.length, ')');
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    console.log('✅ SDP negotiation complete');

  } catch (err) {
    console.error('❌ WebRTC error', err);
    const errEl = document.createElement('pre');
    errEl.textContent = 'ERROR: ' + err;
    chatEl.appendChild(errEl);
  }
})();
