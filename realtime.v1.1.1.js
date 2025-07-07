// realtime.v1.2.0.js - Enhanced UI version
(async function(){
  console.log("✅ Enhanced realtime.js v1.2.0 loaded");

  // Global variables from HTML injection
  const SECRET = window.OPENAI_SECRET;
  const MODEL = window.OPENAI_MODEL;
  console.log("🔑 Injected secret/model:", SECRET, MODEL);

  // UI Elements
  const chatEl = document.getElementById("chat");
  const audioEl = document.getElementById("agent-audio");
  const statusEl = document.getElementById("status");
  const connectBtn = document.getElementById("connect-btn");
  const disconnectBtn = document.getElementById("disconnect-btn");
  const muteBtn = document.getElementById("mute-btn");
  
  // State management
  let pc = null;
  let dc = null;
  let micStream = null;
  let isConnected = false;
  let isMuted = false;
  let isConnecting = false;
  
  const bubbles = {};
  let messageCounter = 0;

  // Enhanced status update function
  const updateStatus = (message, type = 'disconnected', showLoader = false) => {
    const loaderHTML = showLoader ? '<div class="loading-dots"><div></div><div></div><div></div><div></div></div>' : '';
    statusEl.innerHTML = `
      <div class="status-icon"></div>
      <span>${message}</span>
      ${loaderHTML}
    `;
    statusEl.className = `status status-${type}`;
    
    // Add animation class for smooth transitions
    statusEl.style.transform = 'scale(0.95)';
    setTimeout(() => {
      statusEl.style.transform = 'scale(1)';
    }, 100);
  };

  // Button state management
  const updateButtonStates = () => {
    connectBtn.disabled = isConnected || isConnecting;
    disconnectBtn.disabled = !isConnected;
    
    if (isConnecting) {
      connectBtn.innerHTML = '<span>⏳ 連接中...</span>';
    } else if (isConnected) {
      connectBtn.innerHTML = '<span>✅ 已連接</span>';
    } else {
      connectBtn.innerHTML = '<span>🔗 開始連接</span>';
    }
  };

  // Enhanced bubble creation with better animations and features
  function upsertBubble(itemId, clazz, text, done) {
    let div = bubbles[itemId];
    
    if (!div) {
      messageCounter++;
      div = document.createElement('div');
      div.id = `item_${itemId}`;
      div.className = `bubble ${clazz}`;
      div.style.opacity = '0';
      div.style.transform = 'translateY(20px)';
      
      // Enhanced bubble structure
      const messageContainer = document.createElement('div');
      messageContainer.className = 'message-container';
      
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.innerHTML = clazz === 'user' ? '👤' : '🤖';
      
      const content = document.createElement('div');
      content.className = 'content';
      
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = clazz === 'user' ? 'You' : 'AI Assistant';
      
      const text_el = document.createElement('div');
      text_el.className = 'text';
      
      const timestamp = document.createElement('div');
      timestamp.className = 'timestamp';
      timestamp.textContent = new Date().toLocaleTimeString('zh-TW', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      content.append(label, text_el, timestamp);
      messageContainer.append(avatar, content);
      div.appendChild(messageContainer);
      chatEl.appendChild(div);
      bubbles[itemId] = div;
      
      // Smooth entrance animation
      requestAnimationFrame(() => {
        div.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        div.style.opacity = '1';
        div.style.transform = 'translateY(0)';
      });
    }
    
    const textEl = div.querySelector('.text');
    
    // Handle typing indicator
    if (!done && !textEl.classList.contains('typing')) {
      textEl.classList.add('typing');
    }
    
    // Update text content with word-by-word animation for AI responses
    if (clazz === 'agent' && !done) {
      const words = text.split(' ');
      const currentWords = textEl.textContent.split(' ');
      
      if (words.length > currentWords.length) {
        // Add new words with animation
        textEl.textContent = text;
        const newWordsCount = words.length - currentWords.length;
        
        // Highlight new words briefly
        const spans = text.split(' ').map((word, index) => {
          if (index >= currentWords.length) {
            return `<span class="new-word">${word}</span>`;
          }
          return word;
        });
        textEl.innerHTML = spans.join(' ');
        
        setTimeout(() => {
          textEl.textContent = text;
        }, 300);
      } else {
        textEl.textContent = text;
      }
    } else {
      textEl.textContent = text;
    }
    
    if (done) {
      textEl.classList.remove('typing');
      div.classList.add('done');
      
      // Add completion animation
      div.style.transform = 'scale(1.02)';
      setTimeout(() => {
        div.style.transform = 'scale(1)';
      }, 200);
    }
    
    // Auto-scroll with smooth behavior
    setTimeout(() => {
      chatEl.scrollTo({
        top: chatEl.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  }

  // Enhanced audio handling with visual feedback
  const setupAudioHandling = () => {
    audioEl.addEventListener('loadstart', () => {
      if (isConnected) {
        updateStatus('🎵 AI 正在回應...', 'connected');
        // Add visual pulse to audio element
        audioEl.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';
      }
    });
    
    audioEl.addEventListener('play', () => {
      audioEl.style.border = '2px solid #10b981';
    });
    
    audioEl.addEventListener('pause', () => {
      audioEl.style.border = '2px solid #cbd5e1';
      audioEl.style.boxShadow = 'none';
    });
    
    audioEl.addEventListener('ended', () => {
      if (isConnected) {
        updateStatus('✅ 已連接 - 等待您的回應', 'connected');
        audioEl.style.border = '2px solid #cbd5e1';
        audioEl.style.boxShadow = 'none';
      }
    });

    audioEl.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      updateStatus('音頻播放錯誤', 'error');
    });
  };

  // Enhanced event processing with better error handling
  function processAiEvent(msg) {
    try {
      if (msg.type === 'response.audio_transcript.delta' ||
          msg.type === 'response.content_part.delta') {
        const prev = bubbles[msg.item_id]?.querySelector('.text').textContent || '';
        upsertBubble(msg.item_id, 'agent', prev + (msg.delta || ''), false);
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
      else if (msg.type === 'error') {
        console.error('Realtime API error:', msg);
        updateStatus(`錯誤: ${msg.error?.message || '未知錯誤'}`, 'error');
      }
      else if (msg.type === 'response.created') {
        updateStatus('🎤 AI 正在處理您的訊息...', 'connected');
      }
    } catch (error) {
      console.error('Error processing AI event:', error);
    }
  }

  // Enhanced connection management
  const connectToRealtime = async () => {
    if (isConnecting || isConnected) return;
    
    isConnecting = true;
    updateButtonStates();
    updateStatus('正在初始化麥克風...', 'connecting', true);
    
    try {
      // Request microphone permission
      micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      console.log('🎤 Microphone access granted');
      updateStatus('正在建立連接...', 'connecting', true);
      
      // Create peer connection with enhanced configuration
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });
      
      console.log('🧊 RTCPeerConnection created');

      // Enhanced event handlers
      pc.onicecandidate = (e) => {
        console.log('🧊 ICE candidate:', e.candidate?.candidate || 'null');
      };
      
      pc.oniceconnectionstatechange = () => {
        console.log('🌐 ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          updateStatus('連接中斷，正在重試...', 'error');
        }
      };
      
      pc.onconnectionstatechange = () => {
        console.log('🔗 Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          updateStatus('✅ 連接成功！開始對話吧', 'connected');
          isConnected = true;
          isConnecting = false;
          updateButtonStates();
        } else if (pc.connectionState === 'failed') {
          updateStatus('連接失敗', 'error');
          isConnecting = false;
          updateButtonStates();
        }
      };

      // Create data channel with enhanced configuration
      dc = pc.createDataChannel('oai-events', {
        ordered: true
      });
      
      dc.onopen = () => {
        console.log('📡 Data channel opened');
        updateStatus('✅ 已連接 - 語音對話已開始', 'connected');
        
        // Send welcome message to trigger AI greeting
        const startEvent = {
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: 'Please greet the customer warmly and ask how you can help them with their order today.'
          }
        };
        dc.send(JSON.stringify(startEvent));
      };
      
      dc.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          console.log('📨 Received message:', msg.type);
          
          // Handle user transcription
          if (msg.type === 'conversation.item.input_audio_transcription.delta') {
            const prev = bubbles[msg.item_id]?.querySelector('.text').textContent || '';
            upsertBubble(msg.item_id, 'user', prev + (msg.delta || ''), false);
          }
          else if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            upsertBubble(msg.item_id, 'user', msg.transcript, true);
          }
          else {
            processAiEvent(msg);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };
      
      dc.onerror = (error) => {
        console.error('📡 Data channel error:', error);
        updateStatus('數據通道錯誤', 'error');
      };

      // Enhanced audio track handling
      pc.ontrack = (e) => {
        console.log('▶️ Audio track received');
        audioEl.srcObject = e.streams[0];
        audioEl.volume = 0.8;
        audioEl.playbackRate = 0.8; // Slightly slower for better comprehension
        
        // Auto-play with user gesture requirement handling
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log('Auto-play prevented:', error);
            updateStatus('請點擊播放按鈕開始音頻', 'connected');
          });
        }
      };

      // Add microphone tracks
      console.log('🎤 Adding microphone tracks');
      micStream.getTracks().forEach(track => {
        pc.addTrack(track, micStream);
      });

      // Create and send offer
      updateStatus('正在協商連接...', 'connecting', true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('📨 Offer created, SDP length:', offer.sdp.length);

      // Send request to OpenAI Realtime API
      const response = await fetch(
        `https://api.openai.com/v1/realtime?model=${MODEL}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SECRET}`,
            'Content-Type': 'application/sdp'
          },
          body: offer.sdp,
        }
      );

      if (!response.ok) {
        throw new Error(`Realtime API returned ${response.status}: ${response.statusText}`);
      }

      const answer = await response.text();
      console.log('📩 Received answer SDP, length:', answer.length);
      
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      console.log('✅ SDP negotiation complete');
      
    } catch (error) {
      console.error('❌ Connection error:', error);
      updateStatus(`連接錯誤: ${error.message}`, 'error');
      isConnecting = false;
      isConnected = false;
      updateButtonStates();
      
      // Clean up on error
      if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
      }
      if (pc) {
        pc.close();
        pc = null;
      }
    }
  };

  // Enhanced disconnect function
  const disconnectFromRealtime = () => {
    updateStatus('正在斷開連接...', 'connecting');
    
    try {
      // Stop microphone
      if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
      }
      
      // Close peer connection
      if (pc) {
        pc.close();
        pc = null;
      }
      
      // Close data channel
      if (dc) {
        dc.close();
        dc = null;
      }
      
      // Stop audio
      if (audioEl.srcObject) {
        audioEl.srcObject = null;
      }
      
      isConnected = false;
      isConnecting = false;
      updateStatus('已斷開連接', 'disconnected');
      updateButtonStates();
      
      console.log('🔌 Successfully disconnected');
    } catch (error) {
      console.error('Error during disconnect:', error);
      updateStatus('斷開時發生錯誤', 'error');
    }
  };

  // Enhanced mute function
  const toggleMute = () => {
    isMuted = !isMuted;
    
    if (micStream) {
      micStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
    
    audioEl.muted = isMuted;
    
    muteBtn.innerHTML = isMuted ? 
      '<span>🔊 取消靜音</span>' : 
      '<span>🔇 靜音</span>';
    muteBtn.className = isMuted ? 
      'control-btn btn-primary' : 
      'control-btn btn-secondary';
      
    updateStatus(
      isMuted ? '🔇 麥克風已靜音' : '🎤 麥克風已開啟', 
      isConnected ? 'connected' : 'disconnected'
    );
  };

  // Initialize UI
  const initializeUI = () => {
    // Clear chat
    chatEl.innerHTML = '<div class="welcome-message">歡迎來到我們的餐廳！點擊「開始連接」開始與 AI 助理對話...</div>';
    
    // Setup audio controls
    setupAudioHandling();
    
    // Bind event listeners
    connectBtn.addEventListener('click', connectToRealtime);
    disconnectBtn.addEventListener('click', disconnectFromRealtime);
    muteBtn.addEventListener('click', toggleMute);
    
    // Initialize button states
    updateButtonStates();
    updateStatus('準備連接到 OpenAI Realtime API...', 'disconnected');
    
    console.log('🎛️ UI initialized successfully');
  };

  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isConnected) {
      console.log('👁️ Page hidden, maintaining connection');
    } else if (!document.hidden && isConnected) {
      console.log('👁️ Page visible, connection active');
    }
  });

  // Handle beforeunload for cleanup
  window.addEventListener('beforeunload', () => {
    if (isConnected) {
      disconnectFromRealtime();
    }
  });

  // Start initialization
  initializeUI();

  // Make functions available globally for debugging
  window.realtimeAPI = {
    connect: connectToRealtime,
    disconnect: disconnectFromRealtime,
    toggleMute: toggleMute,
    getState: () => ({ isConnected, isMuted, isConnecting })
  };

})();