(async function(){
  // 從 HTML 注入變數中讀取
  const SECRET = window.OPENAI_SECRET;
  const MODEL = window.OPENAI_MODEL;
  console.log("🔗 Starting WebRTC connection", { MODEL });

  const chatEl = document.getElementById("chat");
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
    const pc = new RTCPeerConnection();
    const dc = pc.createDataChannel("oai-events");

    dc.onopen = () => console.log("📡 Data channel open");
    dc.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.conversation?.item?.input_audio_transcription) {
        const d = msg.conversation.item.input_audio_transcription;
        appendBubble(chatEl, d.delta || d.completed, 'user', !!d.completed);
      }
      if (msg.response?.audio_transcript) {
        const r = msg.response.audio_transcript;
        appendBubble(chatEl, r.delta || r.done, 'agent', !!r.done);
      }
    };

    pc.ontrack = e => {
      audioEl.srcObject = e.streams[0];
    };

    // 啟用麥克風
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream.getTracks().forEach(track => pc.addTrack(track, micStream));

    // 建立 offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("📨 Offer created");

    // 將 offer 傳給 OpenAI Realtime API
    const res = await fetch(
      `https://api.openai.com/v1/realtime?model=${MODEL}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SECRET}`,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp,
      }
    );

    if (!res.ok) {
      throw new Error(`Realtime API returned ${res.status}`);
    }

    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    console.log("✅ SDP negotiation complete");

  } catch (err) {
    console.error("❌ WebRTC error", err);
    const errEl = document.createElement('pre');
    errEl.textContent = "ERROR: " + err;
    chatEl.appendChild(errEl);
  }
})();
