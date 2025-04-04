// Get the chat form and its elements
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const chatHistory = document.getElementById('chat-history');
const providerSelect = document.getElementById('provider-select');
const modelSelect = document.getElementById('model-select');
const personaSelect = document.getElementById('persona-select');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const mobileDropzoneButton = document.getElementById('mobile-dropzone-button');
const dropZone = document.getElementById('drop-zone');
const attachmentNamesSpan = document.getElementById('attachment-names');
const buttonGroup = document.querySelector('.button-group');
const settingsButton = document.querySelector('.accordion-button');
const settingsArea = document.querySelector('.accordion-body');
const mobileSettingsButton = document.getElementById('mobile-settings-button');
const settingsAreaMobile = document.getElementById('settings-area');

mobileDropzoneButton.addEventListener('click', () => {
  dropZone.classList.toggle('show-mobile');
});

// Add an event listener to the window's resize event
window.addEventListener('resize', () => {
  const mobileDropzoneButton = document.getElementById('mobile-dropzone-button');
  const screenWidth = window.innerWidth;

  if (screenWidth <= 768) {
    mobileDropzoneButton.style.display = 'block';
  } else {
    mobileDropzoneButton.style.display = 'none';
  }
});

// Add an event listener to the window's resize event
window.addEventListener('resize', () => {
  const screenWidth = window.innerWidth;
  const mobileDropzoneButton = document.getElementById('mobile-dropzone-button');
  const mobileSettingsButton = document.getElementById('mobile-settings-button');

  if (screenWidth <= 768) {
    mobileDropzoneButton.style.display = 'block';
    mobileSettingsButton.style.display = 'block';
  } else {
    mobileDropzoneButton.style.display = 'none';
    mobileSettingsButton.style.display = 'none';
  }
});

// Add event listener to toggle settings area
settingsButton.addEventListener('click', () => {
    settingsArea.classList.toggle('show');
});

// Add event listener to toggle settings area on mobile
mobileSettingsButton.addEventListener('click', () => {
    settingsAreaMobile.classList.toggle('show');
});

// Add CSS to show the settings area when toggled
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.innerHTML = `
        #settings-area.show {
            display: block;
        }
        @media (max-width: 768px) {
            #settings-area.show {
                display: block;
            }
        }
    `;
    document.head.appendChild(style);
});

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
function extractCodeBlocks(markdownContent) {
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const matches = [...markdownContent.matchAll(codeBlockRegex)];

    if (matches.length === 0) {
        return null; // No code blocks found
    }

    // If there's only one code block and it's substantial compared to the total content
    if (matches.length === 1) {
        const codeBlock = matches[0][0]; // Full match including ```
        const codeContent = matches[0][1]; // Just the content inside ```

        // If the code block is at least 70% of the message or the message is mostly just the code block plus a small introduction
        if (codeBlock.length > markdownContent.length * 0.7 ||
            markdownContent.replace(codeBlock, '').trim().split(/\s+/).length < 15) {
            return codeBlock;
        }
    }

    // Multiple code blocks or code block isn't the main content
    return null;
}

function enhanceCodeBlocks(element) {
    const codeBlocks = element.querySelectorAll('pre > code');
    const rawContent = element.dataset.rawContent || '';

    // Add a copy full message button if there's content to copy
    if (rawContent && !element.querySelector('.copy-markdown-button')) {
        const copyFullBtn = document.createElement('button');
        copyFullBtn.className = 'copy-markdown-button';

        // Check if we should just extract code blocks
        const extractedCode = extractCodeBlocks(rawContent);
        if (extractedCode) {
            copyFullBtn.textContent = 'Copy Code as Markdown';
            copyFullBtn.setAttribute('data-extract-only', 'true');
        } else {
            copyFullBtn.textContent = 'Copy Full Message as Markdown';
        }

        copyFullBtn.addEventListener('click', () => {
            // Copy either just the code or the full message
            const contentToCopy = copyFullBtn.getAttribute('data-extract-only') === 'true'
                ? extractedCode
                : rawContent;

            navigator.clipboard.writeText(contentToCopy)
                .then(() => {
                    copyFullBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        if (copyFullBtn.getAttribute('data-extract-only') === 'true') {
                            copyFullBtn.textContent = 'Copy Code as Markdown';
                        } else {
                            copyFullBtn.textContent = 'Copy Full Message as Markdown';
                        }
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

                navigator.clipboard.writeText(codeContent)
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

// --- Helper: Add a message bubble to the chat history UI ---
function addMessage(role, content, isStreaming = false) {
    if (!chatHistory) return null;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    let finalContent = '';
    if (role === 'assistant') {
        // Store the original content for copying
        messageDiv.dataset.rawContent = content;

        // Directly use the content without sanitization, as it's already sanitized on the server-side
        finalContent = content;
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

        const markdownHtml = sanitizeHTML(marked.parse(currentRawContent));
        currentBotMessageDiv.innerHTML = markdownHtml;
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
        const finalRawContent = currentBotMessageDiv.dataset.rawContent;
        const lastMsgIndex = conversationHistory.length - 1;
        if (lastMsgIndex >= 0 && conversationHistory[lastMsgIndex].role === 'assistant') {
            conversationHistory[lastMsgIndex].content = finalRawContent;
            console.log("Finalized bot message in history.");
        } else {
            console.warn("Could not find placeholder in history to finalize message.");
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
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log("SSE stream finished.");
                break;
            }

            buffer += new TextDecoder().decode(value, { stream: true });
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
        attachmentNamesSpan.innerHTML = 'No files or folders added';
    } else {
        const fileContainer = document.createElement('div');
        fileContainer.className = 'file-container';

        combinedFiles.forEach((file, index) => {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-item';

            const fileNameSpan = document.createElement('span');
            fileNameSpan.textContent = file.name;
            fileDiv.appendChild(fileNameSpan);

            const removeButton = document.createElement('button');
            removeButton.innerHTML = '<i class="fas fa-trash"></i>';
            removeButton.onclick = () => {
                combinedFiles.splice(index, 1);
                updateAttachmentNames();
            };
            fileDiv.appendChild(removeButton);

            fileDiv.addEventListener('click', (e) => {
                if (e.target === removeButton) {
                    // Do nothing, let the button's onclick handler delete the file
                } else {
                    // Prevent the file input from opening when clicking on an existing file
                    e.stopPropagation();
                }
            });

            fileContainer.appendChild(fileDiv);
        });

        attachmentNamesSpan.innerHTML = '';
        attachmentNamesSpan.appendChild(fileContainer);
    }
}

dropZone.addEventListener('click', () => {
    if (sendButton.disabled) return;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.onchange = (event) => {
        if (event.target.files.length > 0) {
            const files = Array.from(event.target.files);
            console.log(`Files selected via click: ${files.length}`);
            addNewFiles(files);
            updateAttachmentNames();
        }
    };
    fileInput.click();
});

// Add new files to the list
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
    updateAttachmentNames();
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

// --- Event Listener Setup ---

if (chatForm && messageInput && chatHistory && providerSelect && modelSelect && personaSelect && sendButton && clearButton && dropZone && attachmentNamesSpan) {

    providerSelect.addEventListener('change', updateModelOptions);

    chatForm.addEventListener('submit', handleFormSubmit);

    clearButton.addEventListener('click', clearChat);

    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('dragover');
        }
    });
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        attachmentNamesSpan.textContent = 'Processing dropped items...';

        const items = e.dataTransfer.items;
        const files = e.dataTransfer.files;
        const droppedFiles = [];
        const promises = [];

        if (items && items.length > 0 && items[0].webkitGetAsEntry) {
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) {
                    promises.push(scanDirectoryEntry(entry));
                } else {
                    droppedFiles.push(files[i]);
                }
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

    fetchConfig();

} else {
    console.error("Initialization failed: One or more required HTML elements not found.");
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error';
    errorDiv.textContent = 'Error: Failed to initialize chat interface elements.';
    if (chatHistory) {
        chatHistory.appendChild(errorDiv);
    } else {
        alert(errorDiv.textContent);
    }
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


