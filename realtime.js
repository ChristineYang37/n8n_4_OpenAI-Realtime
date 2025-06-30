(async function(){
  console.log("🔗 Starting WebRTC connection");

  const SECRET = "{{ $json.client_secret.value }}";
  const MODEL = "{{ $json.model }}";
  const chat = document.getElementById("chat");
  const audioEl = document.getElementById("agent-audio");

  try {
    const pc = new RTCPeerConnection();
    const dc = pc.createDataChannel("oai-events");

    dc.onopen = () => console.log("📡 Data channel open");
    dc.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.conversation?.item?.input_audio_transcription) {
        const d = msg.conversation.item.input_audio_transcription;
        appendBubble(chat, d.delta || d.completed, 'user', !!d.completed);
      }
      if (msg.response?.audio_transcript) {
        const r = msg.response.audio_transcript;
        appendBubble(chat, r.delta || r.done, 'agent', !!r.done);
      }
    };

    pc.ontrack = e => audioEl.srcObject = e.streams[0];

    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach(t => pc.addTrack(t, mic));

    await pc.setLocalDescription(await pc.createOffer());
    console.log("📨 Offer created");

    const res = await fetch(`https://api.openai.com/v1/realtime?model=${MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SECRET}`,
        "Content-Type": "application/sdp"
      },
      body: pc.localDescription.sdp
    });
    const answer = await res.text();

    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    console.log("✅ SDP negotiation complete");

  } catch (err) {
    console.error(err);
    const e = document.createElement('pre');
    e.textContent = "ERROR: " + err;
    document.body.appendChild(e);
  }

  function appendBubble(parent, text, clazz, done) {
    if (!text) return;
    const div = document.createElement('div');
    div.className = `bubble ${clazz}` + (done ? ' done' : '');
    div.textContent = text;
    parent.appendChild(div);
    parent.scrollTo(0, parent.scrollHeight);
  }
})();
