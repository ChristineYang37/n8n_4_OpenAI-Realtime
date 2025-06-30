(async function(){
  console.log("✅ realtime.js 已加载");

  //── 注入并打印全局变量 ──
  const SECRET = window.OPENAI_SECRET;
  const MODEL  = window.OPENAI_MODEL;
  console.log("🔑 Injected secret/model:", SECRET, MODEL);

  const chatEl  = document.getElementById("chat");
  const audioEl = document.getElementById("agent-audio");

  function appendBubble(parent, text, clazz, done) {
    if (!text) return;
    const div = document.createElement('div');
    div.className = `bubble ${clazz}` + (done ? ' done' : '');
    div.textContent = text;
    parent.appendChild(div);
    parent.scrollTop = parent.scrollHeight;
  }

  try {
    //── 建立 PeerConnection ──
    const pc = new RTCPeerConnection();
    console.log("🧊 RTCPeerConnection created");

    pc.onicecandidate = e => console.log("🧊 ICE candidate:", e.candidate);
    pc.oniceconnectionstatechange = () =>
      console.log("🌐 ICE state:", pc.iceConnectionState);
    pc.onconnectionstatechange = () =>
      console.log("🔗 Connection state:", pc.connectionState);

    //── DataChannel ──
    const dc = pc.createDataChannel("oai-events");
    dc.onopen = () => {
      console.log("📡 Data channel open (readyState=", dc.readyState, ")");
      // — 测试回环消息，确保通道可用 —
      dc.send(JSON.stringify({ test: "hello from client" }));
    };
    dc.onmessage = e => {
      console.log("⌨️ Received data-channel message:", e.data);
      let msg;
      try { msg = JSON.parse(e.data); }
      catch(err){ console.warn("⚠️ Invalid JSON:", e.data); return; }

      if (msg.test) {
        console.log("🔁 Loopback test received:", msg.test);
        return;
      }
      if (msg.conversation?.item?.input_audio_transcription) {
        const d = msg.conversation.item.input_audio_transcription;
        appendBubble(chatEl, d.delta || d.completed, 'user', !!d.completed);
      }
      if (msg.response?.audio_transcript) {
        const r = msg.response.audio_transcript;
        appendBubble(chatEl, r.delta || r.done, 'agent', !!r.done);
      }
    };

    //── 麦克风采集 & 回放调试 ──
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("🎤 Mic tracks:", micStream.getAudioTracks());
    // 可选：在页面上回放音频，确认确实采集到声音
    const debugAudio = new Audio();
    debugAudio.srcObject = micStream;
    debugAudio.autoplay = true;
    debugAudio.volume = 0.2;
    document.body.appendChild(debugAudio);

    micStream.getTracks().forEach(track => pc.addTrack(track, micStream));

    //── SDP 握手 ──
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("📨 Offer created (SDP length = ", offer.sdp.length, ")");

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
    if (!res.ok) throw new Error(`Realtime API returned ${res.status}`);

    const answer = await res.text();
    console.log("📩 Received answer SDP (length=", answer.length, ")");
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    console.log("✅ SDP negotiation complete");

  } catch (err) {
    console.error("❌ WebRTC error", err);
    const errEl = document.createElement('pre');
    errEl.textContent = "ERROR: " + err;
    chatEl.appendChild(errEl);
  }
})();
