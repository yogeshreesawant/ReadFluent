const viewer = document.getElementById('viewer');
const queueList = document.getElementById('queueList');
const loader = document.getElementById('loader');
const synth = window.speechSynthesis;
// For Backend API
const SUPABASE_URL = 'https://mehjcqzbscppgxepjzez.supabase.co/rest/v1/';
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
let library = JSON.parse(localStorage.getItem('docuvoice_library') || '[]');

async function loadFromLibrary(id) {
    loader.classList.remove('hidden');
    stopTTS(); 
    await sleep(400);

    const item = library.find(x => x.id === id);
    if (item) {
        viewer.innerText = item.content;
        originalText = item.content;
        currentIdx = 0;
        document.getElementById('progressSlider').value = 0;
    }
    loader.classList.add('hidden');
}

function saveToQueue() {
    const text = viewer.innerText;
    if (text.length < 5) return;
    const name = prompt("Name this document:", `Doc ${library.length + 1}`);
    if (name) {
        library.push({ id: Date.now(), name, content: text });
        localStorage.setItem('docuvoice_library', JSON.stringify(library));
        renderLibrary();
    }
}

function removeFromLibrary(id) {
    library = library.filter(x => x.id !== id);
    localStorage.setItem('docuvoice_library', JSON.stringify(library));
    renderLibrary();
}

async function renderLibrary() {
    // Use 'supabaseClient' here
    const { data: documents, error } = await supabaseClient
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
        
    // This line only runs AFTER the data has successfully arrived
    console.log(data);

    if (library.length === 0) {
        queueList.innerHTML = `<p class="text-gray-600 text-xs italic">Empty.</p>`;
        return;
    }
    queueList.innerHTML = library.map(item => `
        <div class="bg-gray-800 border border-gray-700 p-3 rounded-lg flex flex-col gap-2">
            <span class="text-sm font-semibold text-gray-200 truncate">${item.name}</span>
            <div class="flex gap-2">
                <button onclick="loadFromLibrary(${item.id})" class="text-[10px] bg-blue-900/50 text-blue-300 px-3 py-1 rounded hover:bg-blue-800 transition">Load</button>
                <button onclick="removeFromLibrary(${item.id})" class="text-[10px] bg-red-900/50 text-red-300 px-3 py-1 rounded hover:bg-red-800 transition">Delete</button>
            </div>
        </div>
    `).join('');
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

function updateBtn(p) { document.getElementById('playBtn').innerText = p ? "⏸ Pause" : "▶ Play"; }

// --- TRANSLATION & FILE HANDLING ---
async function translateText() {
    const targetLang = document.getElementById('langSelect').value;
    let fullText = beautifyText(viewer.innerText);
    if (fullText.length < 5) return;
    loader.classList.remove('hidden');
    const chunks = [];
    for (let i = 0; i < fullText.length; i += 1500) chunks.push(fullText.substring(i, i + 1500));
    let results = [];
    try {
        for (let i = 0; i < chunks.length; i++) {
            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunks[i])}`);
            const d = await res.json();
            results.push(d[0].map(x => x[0]).join(""));
            await sleep(500);
        }
        const final = beautifyText(results.join(" "));
        viewer.innerText = final;
        originalText = final;
    } catch (err) { alert("Rate limit reached. Please wait a moment."); }
    loader.classList.add('hidden');
}

function downloadText() {
    const blob = new Blob([viewer.innerText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `DocuVoice_${Date.now()}.txt`;
    a.click();
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loader.classList.remove('hidden');
    
    if (file.name.endsWith('.docx')) {
        const r = new FileReader();
        r.onload = (e) => mammoth.extractRawText({arrayBuffer: e.target.result})
            .then(res => { 
                viewer.innerText = beautifyText(res.value); 
                originalText = viewer.innerText; 
                loader.classList.add('hidden'); 
            });
        r.readAsArrayBuffer(file);
    } else if (file.name.endsWith('.pdf')) {
        const typedarray = new Uint8Array(await file.arrayBuffer());
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let t = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const p = await pdf.getPage(i);
            const c = await p.getTextContent();
            t += c.items.map(s => s.str).join(" ") + "\n";
        }
        viewer.innerText = beautifyText(t);
        originalText = viewer.innerText;
        loader.classList.add('hidden');
    } else {
        const r = new FileReader();
        r.onload = (e) => { 
            viewer.innerText = beautifyText(e.target.result); 
            originalText = viewer.innerText; 
            loader.classList.add('hidden'); 
        };
        r.readAsText(file);
    }
});

document.getElementById('speedRange').addEventListener('input', (e) => {
    document.getElementById('speedValue').innerText = parseFloat(e.target.value).toFixed(1) + "x";
    if (synth.speaking) startSpeaking(currentIdx);
});

// --- CHATBOT LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const chatCircle = document.getElementById('chat-circle');
    const chatBox = document.querySelector('.chat-box');
    const chatClose = document.querySelector('.chat-box-toggle');
    const chatForm = document.querySelector('.chat-input form');
    const chatInput = document.getElementById('chat-input');
    const chatLogs = document.querySelector('.chat-logs');

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

        setTimeout(() => {
            appendMessage("I'm a demo bot! I received: " + msg, 'bot');
        }, 1000);
    });

    function appendMessage(text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${type} mb-2 p-2 rounded ${type === 'user' ? 'bg-blue-100 self-end' : 'bg-gray-200'}`;
        msgDiv.innerHTML = `<div class="cm-msg-text text-sm">${text}</div>`;
        chatLogs.appendChild(msgDiv);
        chatLogs.scrollTop = chatLogs.scrollHeight;
    }
});

// Initial load
renderLibrary();
window.speechSynthesis.onvoiceschanged = () => synth.getVoices();

// save function to use the new name
async function saveToQueue() {
    const text = viewer.innerText;
    if (text.length < 5) return;
    
    const name = prompt("Name this document:");
    if (name) {
        loader.classList.remove('hidden');
        
        // Use 'supabaseClient' here
        const { data, error } = await supabaseClient
            .from('documents')
            .insert([{ name: name, content: text }]);

        if (error) {
            alert("Error saving: " + error.message);
        } else {
            renderLibrary(); 
        }
        loader.classList.add('hidden');
    }
}

