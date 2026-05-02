const viewer = document.getElementById('viewer');
const queueList = document.getElementById('queueList');
const loader = document.getElementById('loader');
const synth = window.speechSynthesis;

// --- BACKEND CONFIGURATION ---
// Removed /rest/v1/ from the end of the URL
const SUPABASE_URL = 'https://mehjcqzbscppgxepjzez.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eG4Qi-IuPWPCk1_6PKWemw_BR77yy6z'; 

// Initialize the client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let originalText = ""; 
let currentIdx = 0;
let utterance = null;

const sleep = ms => new Promise(res => setTimeout(res, ms));

function beautifyText(text) {
    return text ? text.split('\n').map(l => l.trim()).filter(l => l !== "").join('\n\n') : "";
}

// --- LIBRARY MANAGEMENT ---

// Helper to load content into the viewer
function loadIntoViewer(content) {
    viewer.innerText = content;
    originalText = content;
    currentIdx = 0;
    document.getElementById('progressSlider').value = 0;
    stopTTS();
}

async function renderLibrary() {
    // 1. Fetch from Supabase
    const { data: documents, error } = await supabaseClient
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error("Fetch error:", error.message);
        queueList.innerHTML = `<p class="text-red-500 text-xs italic">Error loading items.</p>`;
        return;
    }

    // 2. Check if empty
    if (!documents || documents.length === 0) {
        queueList.innerHTML = `<p class="text-gray-600 text-xs italic">Empty.</p>`;
        return;
    }

    // 3. Map the fetched documents to the UI
    queueList.innerHTML = documents.map(item => `
        <div class="bg-gray-800 border border-gray-700 p-3 rounded-lg flex flex-col gap-2">
            <span class="text-sm font-semibold text-gray-200 truncate">${item.name}</span>
            <div class="flex gap-2">
                <button onclick="loadDocumentFromData('${encodeURIComponent(item.content)}')" class="text-[10px] bg-blue-900/50 text-blue-300 px-3 py-1 rounded hover:bg-blue-800 transition">Load</button>
                <button onclick="removeFromLibrary(${item.id})" class="text-[10px] bg-red-900/50 text-red-300 px-3 py-1 rounded hover:bg-red-800 transition">Delete</button>
            </div>
        </div>
    `).join('');
}

// Global helper for the dynamic HTML buttons
window.loadDocumentFromData = (encodedContent) => {
    loadIntoViewer(decodeURIComponent(encodedContent));
};

async function saveToQueue() {
    const text = viewer.innerText;
    if (text.length < 5) return;
    
    const name = prompt("Name this document:");
    if (!name) return;

    loader.classList.remove('hidden');
    
    const { data, error } = await supabaseClient
        .from('documents')
        .insert([{ name: name, content: text }]);

    if (error) {
        alert("Error saving: " + error.message);
    } else {
        await renderLibrary(); // Refresh list from DB
    }
    loader.classList.add('hidden');
}

async function removeFromLibrary(id) {
    if(!confirm("Delete this document?")) return;
    
    const { error } = await supabaseClient
        .from('documents')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Delete failed: " + error.message);
    } else {
        renderLibrary();
    }
}

// --- TTS ENGINE ---
function startSpeaking(fromIndex = 0) {
    synth.cancel();
    originalText = viewer.innerText;
    if (!originalText.trim()) return;

    utterance = new SpeechSynthesisUtterance(originalText.slice(fromIndex));
    utterance.rate = parseFloat(document.getElementById('speedRange').value);
    
    const lang = document.getElementById('langSelect').value;
    const voice = synth.getVoices().find(v => v.lang.includes(lang));
    if (voice) utterance.voice = voice;

    utterance.onboundary = (e) => {
        if (e.name === 'word') {
            currentIdx = fromIndex + e.charIndex;
            document.getElementById('progressSlider').value = (currentIdx / originalText.length) * 100;
            highlightText(currentIdx, e.charLength || 1);
        }
    };

    utterance.onend = () => {
        viewer.innerHTML = originalText; 
        updateBtn(false);
    };

    synth.speak(utterance);
    updateBtn(true);
}

function highlightText(charIndex, length) {
    const text = viewer.innerText;
    let start = text.lastIndexOf('.', charIndex) + 1;
    let end = text.indexOf('.', charIndex + length);
    if (end === -1) end = text.length;
    viewer.innerHTML = `${text.substring(0, start)}<span class="highlight">${text.substring(start, end)}</span>${text.substring(end)}`;
    const h = viewer.querySelector('.highlight');
    if (h) h.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function togglePlay() {
    if (synth.paused) { synth.resume(); updateBtn(true); }
    else if (synth.speaking) { synth.pause(); updateBtn(false); }
    else startSpeaking(currentIdx);
}

function stopTTS() { 
    synth.cancel(); 
    currentIdx = 0; 
    document.getElementById('progressSlider').value = 0;
    viewer.innerHTML = originalText || viewer.innerText; 
    updateBtn(false); 
}

function updateBtn(p) { 
    const btn = document.getElementById('playBtn');
    if(btn) btn.innerText = p ? "⏸ Pause" : "▶ Play"; 
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch from DB
    renderLibrary();
    
    // Chatbot Setup
    const chatCircle = document.getElementById('chat-circle');
    const chatBox = document.querySelector('.chat-box');
    const chatClose = document.querySelector('.chat-box-toggle');
    const chatForm = document.querySelector('.chat-input form');
    const chatInput = document.getElementById('chat-input');
    const chatLogs = document.querySelector('.chat-logs');

    if(chatCircle) {
        chatCircle.addEventListener('click', () => {
            chatBox.style.display = 'block';
            chatCircle.style.display = 'none';
        });

        chatClose.addEventListener('click', () => {
            chatBox.style.display = 'none';
            chatCircle.style.display = 'block';
        });

        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const msg = chatInput.value;
            if (msg.trim() === '') return;
            appendMessage(msg, 'user');
            chatInput.value = '';
            setTimeout(() => appendMessage("I'm a demo bot! I received: " + msg, 'bot'), 1000);
        });
    }

    function appendMessage(text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${type} mb-2 p-2 rounded ${type === 'user' ? 'bg-blue-100 self-end' : 'bg-gray-200'}`;
        msgDiv.innerHTML = `<div class="cm-msg-text text-sm">${text}</div>`;
        chatLogs.appendChild(msgDiv);
        chatLogs.scrollTop = chatLogs.scrollHeight;
    }

    window.speechSynthesis.onvoiceschanged = () => synth.getVoices();
});