// realtime.v1.0.3.js
(async function(){
  console.log("✅ realtime.js 已加载");

  // —— 从 HTML 注入的全局变量读取 —— 
  const SECRET = window.OPENAI_SECRET;
  const MODEL  = window.OPENAI_MODEL;
  console.log("🔑 Injected secret/model:", SECRET, MODEL);

  // 聊天容器与音频播放元素
  const chatEl  = document.getElementById("chat");
  const audioEl = document.getElementById("agent-audio");

  // 用于缓存各 item_id 对应的 DOM 气泡
  const bubbles = {};

  // 创建或更新气泡
  function upsertBubble(itemId, clazz, text, done) {
    let div = bubbles[itemId];
    if (!div) {
      div = document.createElement('div');
      div.className = `bubble ${clazz}`;
      div.id = `item_${itemId}`;
      chatEl.appendChild(div);
      bubbles[itemId] = div;
    }
    div.textContent = text;
    if (done) div.classList.add('done');
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  try {
    // —— 创建 RTCPeerConnection —— 
    const pc = new RTCPeerConnection();
    console.log("🧊 RTCPeerConnection created");

    pc.onicecandidate = e => console.log("🧊 ICE candidate:", e.candidate);
    pc.oniceconnectionstatechange = () =>
      console.log("🌐 ICE state:", pc.iceConnectionState);
    pc.onconnectionstatechange = () =>
      console.log("🔗 Connection state:", pc.connectionState);

    // —— 建立 DataChannel —— 
    const dc = pc.createDataChannel("oai-events");
    dc.onopen = () => console.log("📡 Data channel open");
    dc.onmessage = e => {
      const msg = JSON.parse(e.data);
      // 用户端语音转文字
      if (msg.type === "conversation.item.input_audio_transcription.delta") {
        upsertBubble(msg.item_id, 'user', msg.delta, false);
      }
      else if (msg.type === "conversation.item.input_audio_transcription.completed") {
        upsertBubble(msg.item_id, 'user', msg.transcript, true);
      }
      // Agent 端文字/音频输出
      else if (msg.type === "response.audio_transcript.delta" ||
               msg.type === "response.content_part.delta") {
        // delta 片段累加
        const prev = bubbles[msg.item_id]?.textContent || "";
        upsertBubble(msg.item_id, 'agent', prev + msg.delta, false);
      }
      else if (msg.type === "response.audio_transcript.done" ||
               msg.type === "response.content_part.done" ||
               msg.type === "response.output_item.done") {
        // 完整输出
        const text = msg.transcript ?? msg.part?.transcript ?? bubbles[msg.item_id]?.textContent ?? "";
        upsertBubble(msg.item_id, 'agent', text, true);
      }
    };

    // —— 麦克风采集 & 回放调试 —— 
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("🎤 Mic tracks:", micStream.getAudioTracks());
    // 可选：回放以确认麦克风输入
    const debugAudio = new Audio();
    debugAudio.srcObject = micStream;
    debugAudio.autoplay = true;
    debugAudio.volume = 0.2;
    document.body.appendChild(debugAudio);

    micStream.getTracks().forEach(track => pc.addTrack(track, micStream));

    // —— SDP 握手：创建 offer 并发送至 OpenAI Realtime API —— 
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("📨 Offer created (length:", offer.sdp.length, ")");

    const res = await fetch(
      `https://api.openai.com/v1/realtime?model=${MODEL}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SECRET}`,
          "Content-Type":  "application/sdp"
        },
        body: offer.sdp,
      }
    );
    console.log("📡 Realtime API response status:", res.status);
    if (!res.ok) {
      throw new Error(`Realtime API returned ${res.status}`);
    }

    const answer = await res.text();
    console.log("📩 Received answer SDP (length:", answer.length, ")");
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    console.log("✅ SDP negotiation complete");

    pc.ontrack = e => {
      console.log("▶️ Audio track received, playing");
      audioEl.srcObject = e.streams[0];
    };

  } catch (err) {
    console.error("❌ WebRTC error", err);
    const errEl = document.createElement('pre');
    errEl.textContent = "ERROR: " + err;
    chatEl.appendChild(errEl);
  }
})();
