import { Conversation } from '@11labs/client';

// DOM elements
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const retryButton = document.getElementById('retryButton');
const connectionStatus = document.getElementById('connectionStatus');
const connectionDot = document.getElementById('connectionDot');
const agentStatus = document.getElementById('agentStatus');
const voiceActivity = document.getElementById('voiceActivity');
const activityBars = document.getElementById('activityBars');
const errorToast = document.getElementById('errorToast');
const primaryColorPicker = document.getElementById('primaryColor');
const secondaryColorPicker = document.getElementById('secondaryColor');

// Conversation object to manage the session
let conversation;
let audioContext;
let audioAnalyzer;
let microphone;
let dataArray;
let isRetrying = false;
let retryCount = 0;
const MAX_RETRIES = 3;
let retryTimeout;

// Chat history tracking (kept internally but not displayed)
const chatMessages = [];

/**
 * Initialize audio analyzer for microphone visualization
 */
async function setupAudioAnalyzer() {
    try {
        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Get microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioContext.createMediaStreamSource(stream);
        
        // Create analyzer
        audioAnalyzer = audioContext.createAnalyser();
        audioAnalyzer.fftSize = 32;
        microphone.connect(audioAnalyzer);
        
        // Setup data array for visualization
        dataArray = new Uint8Array(audioAnalyzer.frequencyBinCount);
        
        // Start visualization
        visualizeMicrophone();
    } catch (error) {
        console.error('Error setting up audio analyzer:', error);
        showError('Microphone access denied. Please allow microphone access and try again.');
    }
}

/**
 * Create real-time visualization of microphone input
 */
function visualizeMicrophone() {
    if (!audioAnalyzer) return;
    
    // Get current frequency data
    audioAnalyzer.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    // Update visualizer bars
    const bars = document.querySelectorAll('.activity-bar');
    const speaking = average > 10; // Threshold for speech detection
    
    for (let i = 0; i < bars.length; i++) {
        // Create randomized heights centered around the average volume
        const randomFactor = Math.random() * 0.5 + 0.75; // 0.75 to 1.25
        let height = Math.min(35, average * randomFactor);
        
        // When not speaking, show minimal activity
        if (!speaking) {
            height = Math.random() * 3 + 2;
        }
        
        bars[i].style.height = `${height}px`;
    }
    
    // Update activity indicator styling based on who is speaking
    if (agentStatus.textContent.toLowerCase() === 'speaking') {
        voiceActivity.classList.remove('user-speaking');
        voiceActivity.classList.add('ai-speaking');
    } else if (average > 10) {
        voiceActivity.classList.add('user-speaking');
        voiceActivity.classList.remove('ai-speaking');
    } else {
        voiceActivity.classList.remove('user-speaking');
        voiceActivity.classList.remove('ai-speaking');
    }
    
    // Continue animation
    requestAnimationFrame(visualizeMicrophone);
}

/**
 * Track message in internal array but don't display it visually
 * @param {string} text - Message content
 * @param {string} sender - 'user' or 'ai'
 */
function trackChatMessage(text, sender) {
    // Create message object
    const message = {
        text,
        sender,
        timestamp: new Date()
    };
    
    // Add to message array
    chatMessages.push(message);
    
    // Log the message to console (optional, for debugging)
    console.log(`${sender}: ${text}`);
}

/**
 * Format time for chat messages
 * @param {Date} date - The timestamp to format
 * @returns {string} - Formatted time string
 */
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Show error toast message
 * @param {string} message - Error message to display
 */
function showError(message) {
    errorToast.textContent = message;
    errorToast.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        errorToast.style.display = 'none';
    }, 5000);
}

/**
 * Update connection status indicators
 * @param {string} status - Connection status
 */
function updateConnectionStatus(status) {
    connectionStatus.textContent = status;
    
    // Update status dot
    connectionDot.classList.remove('dot-connected', 'dot-disconnected', 'dot-error');
    
    switch (status) {
        case 'Connected':
            connectionDot.classList.add('dot-connected');
            break;
        case 'Disconnected':
            connectionDot.classList.add('dot-disconnected');
            break;
        default:
            if (status.includes('Error')) {
                connectionDot.classList.add('dot-error');
            } else {
                connectionDot.classList.add('dot-disconnected');
            }
    }
}

/**
 * Enable/disable buttons based on connection state
 * @param {boolean} isConnected - Whether connection is established
 * @param {boolean} isError - Whether in error state
 */
function updateButtonState(isConnected, isError = false) {
    startButton.disabled = isConnected || isRetrying;
    stopButton.disabled = !isConnected || isRetrying;
    retryButton.disabled = !isError || isRetrying;
}

/**
 * Apply theme colors to UI
 * @param {string} primary - Primary color hex code
 * @param {string} secondary - Secondary color hex code
 */
function applyTheme(primary, secondary) {
    document.documentElement.style.setProperty('--primary-color', primary);
    document.documentElement.style.setProperty('--secondary-color', secondary);
    
    // Derive accent color (lighter version of primary)
    const accent = lightenColor(primary, 40);
    document.documentElement.style.setProperty('--accent-color', accent);
    
    // Update header background
    document.querySelector('.header').style.background = 
        `linear-gradient(135deg, ${primary}, ${secondary})`;
}

/**
 * Lighten a hex color
 * @param {string} color - Hex color code
 * @param {number} percent - Percentage to lighten
 * @returns {string} - Lightened hex color
 */
function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    return '#' + (
        0x1000000 +
        (R < 255 ? R : 255) * 0x10000 +
        (G < 255 ? G : 255) * 0x100 +
        (B < 255 ? B : 255)
    ).toString(16).slice(1);
}

/**
 * Start a conversation with the ElevenLabs agent
 * This example uses direct agent ID authentication (for public agents)
 */
async function startConversation() {
    try {
        updateConnectionStatus('Connecting...');
        startButton.disabled = true;
        
        // Set up audio analyzer for microphone visualization
        await setupAudioAnalyzer();
        
        // Start the conversation
        conversation = await Conversation.startSession({
            agentId: 'HD9tfBY7gnrQiM2nEMp5', // Replace with your actual agent ID
            onConnect: () => {
                updateConnectionStatus('Connected');
                updateButtonState(true);
                agentStatus.textContent = 'Listening';
                retryCount = 0;
                
                // Clear any retry timeouts
                if (retryTimeout) {
                    clearTimeout(retryTimeout);
                }
            },
            onDisconnect: () => {
                updateConnectionStatus('Disconnected');
                updateButtonState(false);
                agentStatus.textContent = 'Waiting';
                
                // If not manually stopped and not in retry cycle, attempt reconnect
                if (conversation && !isRetrying) {
                    handleDisconnect();
                }
            },
            onError: (error) => {
                console.error('Error:', error);
                updateConnectionStatus('Error');
                updateButtonState(false, true);
                showError(`Connection error: ${error.message || 'Unknown error'}`);
                
                // If not in retry cycle, attempt reconnect
                if (!isRetrying) {
                    handleDisconnect();
                }
            },
            onModeChange: (mode) => {
                agentStatus.textContent = mode.mode === 'speaking' ? 'Speaking' : 'Listening';
            },
            onNewMessage: (message) => {
                // Track AI message internally but don't display
                trackChatMessage(message.text, 'ai');
            },
            onUserMessageCaptured: (message) => {
                // Track user message internally but don't display
                trackChatMessage(message.text, 'user');
            }
        });
    } catch (error) {
        console.error('Failed to start conversation:', error);
        updateConnectionStatus(`Error: ${error.message}`);
        updateButtonState(false, true);
        showError(`Failed to start conversation: ${error.message}`);
    }
}

/**
 * Handle disconnection with retry logic
 */
function handleDisconnect() {
    if (retryCount >= MAX_RETRIES) {
        showError(`Connection failed after ${MAX_RETRIES} attempts. Please try again later.`);
        isRetrying = false;
        updateButtonState(false, true);
        return;
    }
    
    isRetrying = true;
    retryCount++;
    
    const delay = Math.min(2000 * retryCount, 10000); // Exponential backoff, max 10s
    
    updateConnectionStatus(`Reconnecting (${retryCount}/${MAX_RETRIES})...`);
    
    // Schedule retry
    retryTimeout = setTimeout(() => {
        if (conversation) {
            // Clean up existing connection
            conversation.endSession().catch(console.error);
            conversation = null;
        }
        
        startConversation();
    }, delay);
}

/**
 * End the current conversation session
 */
async function stopConversation() {
    if (conversation) {
        try {
            await conversation.endSession();
        } catch (error) {
            console.error('Error stopping conversation:', error);
        } finally {
            conversation = null;
            isRetrying = false;
            
            // Clear any scheduled retries
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
            
            updateConnectionStatus('Disconnected');
            updateButtonState(false);
            agentStatus.textContent = 'Waiting';
        }
    }
}

/**
 * Manually retry connection
 */
async function retryConnection() {
    isRetrying = false;
    retryCount = 0;
    
    // Clear any scheduled retries
    if (retryTimeout) {
        clearTimeout(retryTimeout);
    }
    
    // Clean up existing connection if any
    if (conversation) {
        try {
            await conversation.endSession();
        } catch (error) {
            console.error('Error cleaning up conversation:', error);
        } finally {
            conversation = null;
        }
    }
    
    // Start new connection
    startConversation();
}

// Event listeners
startButton.addEventListener('click', startConversation);
stopButton.addEventListener('click', stopConversation);
retryButton.addEventListener('click', retryConnection);

// Theme customization
primaryColorPicker.addEventListener('change', () => {
    applyTheme(primaryColorPicker.value, secondaryColorPicker.value);
});

secondaryColorPicker.addEventListener('change', () => {
    applyTheme(primaryColorPicker.value, secondaryColorPicker.value);
});

// Initialize theme
applyTheme(primaryColorPicker.value, secondaryColorPicker.value);

/**
 * For Private Agents - Uncomment and use this code instead of the direct agentId method above
 * You'll need to set up the backend server as described in the tutorial
 */
/*
async function getSignedUrl() {
    try {
        const response = await fetch('http://localhost:3001/api/get-signed-url');
        if (!response.ok) {
            throw new Error(`Failed to get signed URL: ${response.statusText}`);
        }
        const { signedUrl } = await response.json();
        return signedUrl;
    } catch (error) {
        console.error('Error fetching signed URL:', error);
        throw error;
    }
}

async function startConversationWithSignedUrl() {
    try {
        updateConnectionStatus('Connecting...');
        startButton.disabled = true;
        
        // Set up audio analyzer for microphone visualization
        await setupAudioAnalyzer();
        
        // Get signed URL from your backend
        const signedUrl = await getSignedUrl();
        
        // Start the conversation
        conversation = await Conversation.startSession({
            signedUrl,
            onConnect: () => {
                updateConnectionStatus('Connected');
                updateButtonState(true);
                agentStatus.textContent = 'Listening';
                retryCount = 0;
                
                // Clear any retry timeouts
                if (retryTimeout) {
                    clearTimeout(retryTimeout);
                }
            },
            onDisconnect: () => {
                updateConnectionStatus('Disconnected');
                updateButtonState(false);
                agentStatus.textContent = 'Waiting';
                
                // If not manually stopped and not in retry cycle, attempt reconnect
                if (conversation && !isRetrying) {
                    handleDisconnect();
                }
            },
            onError: (error) => {
                console.error('Error:', error);
                updateConnectionStatus('Error');
                updateButtonState(false, true);
                showError(`Connection error: ${error.message || 'Unknown error'}`);
                
                // If not in retry cycle, attempt reconnect
                if (!isRetrying) {
                    handleDisconnect();
                }
            },
            onModeChange: (mode) => {
                agentStatus.textContent = mode.mode === 'speaking' ? 'Speaking' : 'Listening';
            },
            onNewMessage: (message) => {
                // Track AI message internally but don't display
                trackChatMessage(message.text, 'ai');
            },
            onUserMessageCaptured: (message) => {
                // Track user message internally but don't display
                trackChatMessage(message.text, 'user');
            }
        });
    } catch (error) {
        console.error('Failed to start conversation:', error);
        updateConnectionStatus(`Error: ${error.message}`);
        updateButtonState(false, true);
        showError(`Failed to start conversation: ${error.message}`);
    }
}

// Use this line instead if using signed URLs
// startButton.addEventListener('click', startConversationWithSignedUrl);
*/