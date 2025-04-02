// --- my_chat_app/static/script.js ---
// Get the chat form and its elements
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const chatHistory = document.getElementById('chat-history');
const providerSelect = document.getElementById('provider-select');
const modelSelect = document.getElementById('model-select');
const personaSelect = document.getElementById('persona-select');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const dropZone = document.getElementById('drop-zone');
const attachmentNamesSpan = document.getElementById('attachment-names');
const buttonGroup = document.querySelector('.button-group'); // Select the button group

// State variables
let currentBotMessageDiv = null;
let conversationHistory = [];
let configData = null;
let combinedFiles = []; 

// --- Helper: Sanitize HTML ---
function sanitizeHTML(htmlString) {
    return DOMPurify.sanitize(htmlString, {
        USE_PROFILES: { html: true }, 
        ADD_TAGS: ['pre', 'code'], 
        ADD_ATTR: ['class'] 
    });
}

// --- Helper: Enhance code blocks for Prism ---
function enhanceCodeBlocks(element) {
    const codeBlocks = element.querySelectorAll('pre > code');
    const rawContent = element.dataset.rawContent || '';
    
    // Add a copy full message button if there's content to copy
    if (rawContent && !element.querySelector('.copy-markdown-button')) {
        const copyFullBtn = document.createElement('button');
        copyFullBtn.className = 'copy-markdown-button';
        copyFullBtn.textContent = 'Copy Full Message as Markdown';
        copyFullBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(rawContent)
                .then(() => {
                    copyFullBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        copyFullBtn.textContent = 'Copy Full Message as Markdown';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy markdown: ', err);
                });
        });
        element.appendChild(copyFullBtn);
    }
    
    // Process each code block
    codeBlocks.forEach((codeBlock, index) => {
        // Add language class if missing
        if (!codeBlock.className.includes('language-')) {
            codeBlock.classList.add('language-plaintext');
        }
        
        // Get the language from the class
        const langMatch = codeBlock.className.match(/language-(\w+)/);
        const language = langMatch ? langMatch[1] : 'plaintext';
        
        const preBlock = codeBlock.parentElement;
        if (!preBlock.parentElement.classList.contains('code-block')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block';
            preBlock.parentNode.insertBefore(wrapper, preBlock);
            wrapper.appendChild(preBlock);
            
            // Add copy button that includes markdown formatting
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-button';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => {
                // Get the code content
                const codeContent = codeBlock.textContent;
                
                // Format with markdown triple backticks and language
                const formattedCode = '```' + language + '\n' + codeContent + '\n```';
                
                navigator.clipboard.writeText(formattedCode)
                    .then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('Failed to copy code: ', err);
                    });
            });
            wrapper.appendChild(copyBtn);
        }
    });
    
    if (window.Prism) {
        Prism.highlightAllUnder(element);
    }
}

// --- Core Functions ---

// Fetch initial config from the backend
async function fetchConfig() {
    try {
        const response = await fetch('/config');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        configData = await response.json();
        updateModelOptions(); 
    } catch (error) {
        console.error("Error fetching config:", error);
        addMessage('error', 'Could not load server configuration.');
    }
}

// Update model dropdown based on selected provider
function updateModelOptions() {
    if (!configData || !providerSelect) return;
    const selectedProvider = providerSelect.value;
    const providerInfo = configData.providers[selectedProvider];
    modelSelect.innerHTML = ''; 

    if (providerInfo && providerInfo.models && providerInfo.models.length > 0) {
        providerInfo.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            if (model === providerInfo.default_model) {
                option.selected = true;
            }
            modelSelect.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.textContent = 'No models available';
        option.disabled = true;
        modelSelect.appendChild(option);
    }
}

// Add a message bubble to the chat history UI
function addMessage(role, content, isStreaming = false) {
    if (!chatHistory) return null;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role); 

    let finalContent = '';
    if (role === 'assistant') { 
        // Store the original content for copying
        messageDiv.dataset.rawContent = content;
        
        // Parse Markdown and then sanitize the HTML for display
        const markdownHtml = marked.parse(content);
        finalContent = sanitizeHTML(markdownHtml);
    } else { 
        // For user messages, escape the content to prevent XSS
        const escapedContent = content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        finalContent = escapedContent.replace(/\n/g, '<br>'); 
    }

    messageDiv.innerHTML = finalContent;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight; 
    
    if (role === 'assistant') {
        // After adding the message, enhance code blocks for Prism
        enhanceCodeBlocks(messageDiv);
    }

    if (role === 'assistant' && isStreaming) {
        currentBotMessageDiv = messageDiv;
    } else {
        currentBotMessageDiv = null;
        if (role !== 'error') {
            conversationHistory.push({ role, content });
        }
    }
    return messageDiv;
}


// Append a chunk of text to the currently streaming bot message
function appendStreamChunk(chunk) {
    if (currentBotMessageDiv) {
        let currentRawContent = currentBotMessageDiv.dataset.rawContent || '';
        currentRawContent += chunk;
        currentBotMessageDiv.dataset.rawContent = currentRawContent;

        const markdownHtml = marked.parse(currentRawContent);
        const safeHtml = sanitizeHTML(markdownHtml);
        
        currentBotMessageDiv.innerHTML = safeHtml;
        enhanceCodeBlocks(currentBotMessageDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight; 
    } else {
        console.warn("Received stream chunk but no active bot message div. Creating new one.");
        addMessage('assistant', chunk, true);
    }
}


// Finalize the bot message after streaming ends
function finalizeBotMessage() {
    if (currentBotMessageDiv) {
        const finalRawContent = currentBotMessageDiv.dataset.rawMarkdown || ''; 
        const lastMsgIndex = conversationHistory.length - 1;
        if (lastMsgIndex >= 0 && conversationHistory[lastMsgIndex].role === 'assistant' && conversationHistory[lastMsgIndex].content === '...') {
            conversationHistory[lastMsgIndex].content = finalRawContent; 
            console.log("Finalized bot message in history.");
        } else {
            console.warn("Could not find placeholder '...' in history to finalize message.");
            conversationHistory.push({ role: 'assistant', content: finalRawContent });
        }

        // Keep the raw Markdown for potential copying but set a flag that it's finalized
        currentBotMessageDiv.dataset.finalized = 'true';
        currentBotMessageDiv = null; 
        
        enhanceCodeBlocks(chatHistory.lastElementChild);
    } else {
        console.log("Finalize called but no active bot message div.");
    }
    
    // Replace the "Stop" button with the "Send" button
    const stopButton = buttonGroup.querySelector('button.btn.btn-danger');
    if (stopButton) {
        buttonGroup.replaceChild(sendButton, stopButton);
        sendButton.disabled = false;
    }
}


// Handle the chat form submission
async function handleFormSubmit(event) {
    event.preventDefault(); 
    const message = messageInput.value.trim();
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const persona = personaSelect.value;
    const filesToUpload = combinedFiles; 

    if (!message && filesToUpload.length === 0) {
        return; 
    }
    if (!model) {
        addMessage('error', 'Please select a model.');
        return;
    }

    let userDisplayMessage = message || "(Sending attached files)"; 
    if (filesToUpload.length > 0) {
        const fileText = filesToUpload.length === 1 ? 'file' : 'files';
        userDisplayMessage += `\n(Attached ${filesToUpload.length} ${fileText})`;
    }
    addMessage('user', userDisplayMessage); 

    if (message) {
        conversationHistory.push({ role: 'user', content: message });
    }
    messageInput.value = ''; 

    setFormDisabled(true); 
    addMessage('assistant', '...', true);
    conversationHistory.push({ role: 'assistant', content: '...' });

    const formData = new FormData();
    formData.append('message', message); 
    formData.append('provider', provider);
    formData.append('model', model);
    formData.append('persona', persona);

    const historyForAPI = conversationHistory.slice(0, -2);
    formData.append('history', JSON.stringify(historyForAPI));

    if (filesToUpload.length > 0) {
        filesToUpload.forEach(file => {
            const fileName = file.webkitRelativePath || file.name;
            formData.append('files', file, fileName);
            console.log(`Appending file to FormData: ${fileName} (${file.size} bytes)`);
        });
    }

    updateAttachmentNames(); 

    try {
        const controller = new AbortController();
        const signal = controller.signal;

        const response = await fetch('/chat', {
            method: 'POST',
            body: formData,
            signal: signal
        });

        // Replace send button with stop button
        const stopButton = document.createElement('button');
        stopButton.textContent = 'Stop';
        stopButton.classList.add('btn', 'btn-danger');
        stopButton.onclick = () => {
            controller.abort();
            stopButton.disabled = true;
            buttonGroup.replaceChild(sendButton, stopButton);
            sendButton.disabled = false;
        };
        buttonGroup.replaceChild(stopButton, sendButton);

        if (!response.ok) {
            let errorMsg = `HTTP error! Status: ${response.status}`;
            try { 
                const errorData = await response.json();
                if (errorData && errorData.message) {
                    errorMsg = errorData.message; 
                } else {
                    const textError = await response.text(); 
                    if (textError) errorMsg = textError;
                }
            } catch (e) { /* Ignore if response is not JSON */ }
            throw new Error(errorMsg); 
        }

        if (!response.headers.get("content-type")?.includes("text/event-stream")) {
            throw new Error("Server did not respond with an event stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; 

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log("SSE stream finished.");
                break; 
            }

            buffer += decoder.decode(value, { stream: true }); 
            let lines = buffer.split('\n'); 
            buffer = lines.pop(); 

            for (const line of lines) {
                if (!line.trim()) continue; 

                let eventType = 'message'; 
                let dataContent = line;

                if (line.startsWith('event:')) {
                    eventType = line.substring('event:'.length).trim();
                } else if (line.startsWith('data:')) {
                    dataContent = line.substring('data:'.length).trim();
                } else {
                    console.debug("Received line without 'data:' prefix, treating as data:", line);
                    dataContent = line;
                }

                if (eventType === 'chunk' || eventType === 'message') { 
                    try {
                        const data = JSON.parse(dataContent);
                        if (data.content) {
                            appendStreamChunk(data.content); 
                        } else {
                            console.warn("Received chunk/message event without 'content':", data);
                        }
                    } catch (e) {
                        console.error("Failed to parse SSE data JSON:", dataContent, e);
                    }
                } else if (eventType === 'error') {
                    console.error("SSE Error Event Received:", dataContent);
                    try {
                        const errorData = JSON.parse(dataContent);
                        addMessage('error', errorData.message || dataContent);
                    } catch (e) {
                        addMessage('error', dataContent); 
                    }
                    finalizeBotMessage(); 
                    if (reader) reader.cancel("SSE error received"); 
                    break; 
                } else if (eventType === 'end') {
                    console.log("SSE End Event Received:", dataContent);
                } else {
                    console.log(`Received unhandled SSE event type '${eventType}':`, dataContent);
                }
            } 

            if (reader.cancelled) {
                console.log("SSE reader cancelled.");
                break; 
            }
        } 

        finalizeBotMessage(); 

    } catch (error) {
        console.error("Chat request failed:", error);
        addMessage('error', `Error: ${error.message}`);
        finalizeBotMessage(); 
    } finally {
        setFormDisabled(false); 
    }
}

// Clear chat history and file list
function clearChat() {
    chatHistory.innerHTML = ''; 
    conversationHistory = []; 
    combinedFiles = []; 
    attachmentNamesSpan.textContent = 'No files or folders added'; 
    currentBotMessageDiv = null; 
    addMessage('bot', 'Conversation cleared.');
    console.log("Chat cleared.");
}

// Update the text displaying the names/count of attached files
function updateAttachmentNames() {
    if (!attachmentNamesSpan) return;
    const numFiles = combinedFiles.length;

    if (numFiles === 0) {
        attachmentNamesSpan.textContent = 'No files or folders added';
    } else if (numFiles === 1) {
        if (combinedFiles[0].webkitRelativePath) {
            attachmentNamesSpan.textContent = `1 file added (from directory)`;
        } else {
            attachmentNamesSpan.textContent = `1 file added: ${combinedFiles[0].name}`;
        }
    } else {
        const allFromDir = combinedFiles.every(f => f.webkitRelativePath);
        if (allFromDir && combinedFiles[0].webkitRelativePath) {
            const firstPath = combinedFiles[0].webkitRelativePath;
            const dirName = firstPath.split('/')[0]; 
            attachmentNamesSpan.textContent = `Directory '${dirName}' added (${numFiles} files)`;
        } else {
            const fileNames = combinedFiles.map(file => file.name).join(', ');
            attachmentNamesSpan.textContent = `${numFiles} files added: ${fileNames}`;
        }
    }
}

// Disable or enable form controls and drop zone
function setFormDisabled(disabled) {
    sendButton.disabled = disabled;
    messageInput.disabled = disabled;
    providerSelect.disabled = disabled;
    modelSelect.disabled = disabled;
    personaSelect.disabled = disabled;
    clearButton.disabled = disabled; 

    if (dropZone) {
        dropZone.style.pointerEvents = disabled ? 'none' : 'auto';
        dropZone.style.opacity = disabled ? 0.6 : 1;
    }
}

// --- Drag and Drop Logic ---

async function scanDirectoryEntry(entry) {
    if (entry.isFile) {
        return new Promise((resolve, reject) => {
            entry.file(file => resolve([file]), err => reject(err));
        });
    } else if (entry.isDirectory) {
        let reader = entry.createReader();
        let allEntries = [];
        return new Promise((resolve, reject) => {
            const readEntries = async () => {
                reader.readEntries(async (entries) => {
                    if (entries.length > 0) {
                        const batchPromises = [];
                        for (const subEntry of entries) {
                            batchPromises.push(scanDirectoryEntry(subEntry)); 
                        }
                        try {
                            const fileArrays = await Promise.all(batchPromises);
                            fileArrays.forEach(fileArray => allEntries.push(...fileArray));
                            readEntries(); 
                        } catch (err) {
                            reject(err); 
                        }
                    } else {
                        resolve(allEntries); 
                    }
                }, err => reject(err)); 
            };
            readEntries(); 
        });
    }
    return []; 
}

function addNewFiles(newFiles) {
    const uniqueNewFiles = newFiles.filter(newFile =>
        !combinedFiles.some(existingFile =>
            existingFile.name === newFile.name &&
            existingFile.size === newFile.size &&
            existingFile.lastModified === newFile.lastModified &&
            (existingFile.webkitRelativePath || null) === (newFile.webkitRelativePath || null)
        )
    );
    if (uniqueNewFiles.length > 0) {
        console.log(`Adding ${uniqueNewFiles.length} new unique files.`);
        combinedFiles.push(...uniqueNewFiles);
    } else {
        console.log("No new unique files to add (duplicates or empty list).");
    }
}

// --- Event Listener Setup ---

if (chatForm && messageInput && chatHistory && providerSelect && modelSelect && personaSelect && sendButton && clearButton && dropZone && attachmentNamesSpan) {

    providerSelect.addEventListener('change', updateModelOptions);

    chatForm.addEventListener('submit', handleFormSubmit);

    clearButton.addEventListener('click', clearChat);

    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation(); 
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!dropZone.contains(e.relatedTarget)) { dropZone.classList.remove('dragover'); }
    });
    dropZone.addEventListener('drop', async (e) => {
        console.log("Drop event fired!");
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('dragover');
        attachmentNamesSpan.textContent = 'Processing dropped items...';

        const items = e.dataTransfer.items;
        const files = e.dataTransfer.files; 
        const droppedFiles = [];
        const promises = [];

        if (items && items.length > 0 && items[0].webkitGetAsEntry) {
            console.log("Processing dropped items using webkitGetAsEntry API.");
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) { promises.push(scanDirectoryEntry(entry)); }
            }
            try {
                const fileArrays = await Promise.all(promises);
                fileArrays.forEach(fileArray => droppedFiles.push(...fileArray));
                console.log(`Processed ${droppedFiles.length} files from drop.`);
                addNewFiles(droppedFiles);
                updateAttachmentNames();
            } catch (error) {
                console.error('Error processing dropped items:', error);
                addMessage('error', `Error processing dropped items: ${error.message}`);
                updateAttachmentNames(); 
            }
        } else if (files && files.length > 0) {
            console.log("Processing dropped files using fallback dataTransfer.files API.");
            addNewFiles(Array.from(files));
            updateAttachmentNames();
        } else {
            console.log("No items or files found in drop event.");
            updateAttachmentNames(); 
        }
    });

    dropZone.addEventListener('click', () => {
        if (sendButton.disabled) return; 
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.onchange = (event) => {
            if (event.target.files.length > 0) {
                console.log(`Files selected via click: ${event.target.files.length}`);
                addNewFiles(Array.from(event.target.files));
                updateAttachmentNames();
            }
        };
        fileInput.click();
    });

    fetchConfig();

} else {
    console.error("Initialization failed: One or more required HTML elements not found.");
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error';
    errorDiv.textContent = 'Error: Failed to initialize chat interface elements.';
    if (chatHistory) { chatHistory.appendChild(errorDiv); } else { alert(errorDiv.textContent); }
}

document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList.contains('bot') || node.querySelector('.bot')) {
                            const botMessage = node.classList.contains('bot') ? node : node.querySelector('.bot');
                            if (botMessage) {
                                enhanceCodeBlocks(botMessage);
                            }
                        }
                    }
                });
            }
        });
    });

    observer.observe(document.getElementById('chat-history'), {
        childList: true,
        subtree: true
    });
});
