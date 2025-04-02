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

// State variables
let currentBotMessageDiv = null;
let conversationHistory = [];
let configData = null;
let combinedFiles = []; // Holds File objects to be uploaded

// --- Helper: Sanitize HTML ---
// Configure DOMPurify slightly - allow target="_blank" for links if needed
// DOMPurify.setConfig({ ADD_ATTR: ['target'] }); // Example config
function sanitizeHTML(htmlString) {
    // Use DOMPurify to sanitize HTML generated from Markdown
    // Allow common formatting tags + code highlighting classes
    return DOMPurify.sanitize(htmlString, {
         USE_PROFILES: { html: true }, // Use standard HTML profile
         ADD_TAGS: ['pre', 'code'], // Ensure pre/code are allowed
         ADD_ATTR: ['class'] // Allow 'class' attribute for potential syntax highlighting later
        });
}

// --- Helper: Enhance code blocks for Prism ---
function enhanceCodeBlocks(element) {
    // Find all code blocks within pre tags
    const codeBlocks = element.querySelectorAll('pre > code');
    
    codeBlocks.forEach(codeBlock => {
        // If there's no language class, try to detect from context or add a default
        if (!codeBlock.className.includes('language-')) {
            // Default to plaintext if no language specified
            codeBlock.classList.add('language-plaintext');
        }
        
        // Add a copy button to each code block
        const preBlock = codeBlock.parentElement;
        if (!preBlock.parentElement.classList.contains('code-block')) {
            // Wrap the pre in a div for positioning the copy button
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block';
            preBlock.parentNode.insertBefore(wrapper, preBlock);
            wrapper.appendChild(preBlock);
            
            // Add copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-button';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(codeBlock.textContent)
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
    
    // Trigger Prism to highlight all code blocks
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
        updateModelOptions(); // Populate models based on default provider
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
    modelSelect.innerHTML = ''; // Clear existing options

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
// Content should be treated as *plain text* for user/error, and *Markdown* for bot
function addMessage(role, content, isStreaming = false) {
    if (!chatHistory) return null;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role); // e.g., 'message user', 'message bot', 'message error'

    let finalContent = '';
    if (role === 'assistant') { // Parse and sanitize bot messages
        const unsafeHtml = marked.parse(content); // Use marked.parse for bot content
        finalContent = sanitizeHTML(unsafeHtml); // Sanitize the result
        messageDiv.dataset.rawContent = content; // Store raw Markdown for streaming updates
    } else { // For user and error messages, treat as plain text (escape HTML)
        // Basic escaping: replace chars that have special meaning in HTML
        const escapedContent = content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        finalContent = escapedContent.replace(/\n/g, '<br>'); // Still allow line breaks
    }

    messageDiv.innerHTML = finalContent;
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom
    
    // Apply syntax highlighting to code blocks
    if (role === 'assistant') {
        enhanceCodeBlocks(messageDiv);
    }

    if (role === 'assistant' && isStreaming) {
        currentBotMessageDiv = messageDiv;
        // rawContent dataset is already set above
    } else {
        currentBotMessageDiv = null;
        if (role !== 'error') {
            // Store the *original* unparsed content for history
            conversationHistory.push({ role, content });
        }
    }
    return messageDiv;
}

// Append a chunk of text to the currently streaming bot message
function appendStreamChunk(chunk) {
    if (currentBotMessageDiv) {
        // Append raw chunk to the stored raw content
        let currentRawContent = currentBotMessageDiv.dataset.rawContent || '';
        currentRawContent += chunk;
        currentBotMessageDiv.dataset.rawContent = currentRawContent;

        // Parse the *entire accumulated raw markdown* and sanitize
        const unsafeHtml = marked.parse(currentRawContent);
        const safeHtml = sanitizeHTML(unsafeHtml);

        // Update the div's content with the latest formatted HTML
        currentBotMessageDiv.innerHTML = safeHtml;
        
        // Apply syntax highlighting to code blocks
        enhanceCodeBlocks(currentBotMessageDiv);
        
        chatHistory.scrollTop = chatHistory.scrollHeight; // Keep scrolled to bottom
    } else {
        // If streaming starts unexpectedly, create a new message div
        console.warn("Received stream chunk but no active bot message div. Creating new one.");
        // Start a new streaming message, passing the first chunk as Markdown
        addMessage('assistant', chunk, true);
        // Note: addMessage already handles parsing, sanitizing, and setting rawContent
    }
}

// Finalize the bot message after streaming ends
function finalizeBotMessage() {
    if (currentBotMessageDiv) {
        // Get the final raw Markdown content stored in the dataset
        const finalRawContent = currentBotMessageDiv.dataset.rawContent || ''; // Fallback just in case

        // Find the placeholder "..." message in the internal history and update it
        // with the final *raw* Markdown content.
        const lastMsgIndex = conversationHistory.length - 1;
        if (lastMsgIndex >= 0 && conversationHistory[lastMsgIndex].role === 'assistant' && conversationHistory[lastMsgIndex].content === '...') {
            conversationHistory[lastMsgIndex].content = finalRawContent; // Update history with raw Markdown
            console.log("Finalized bot message in history.");
        } else {
            // Should not happen if placeholder was added correctly, but handle defensively
            console.warn("Could not find placeholder '...' in history to finalize message.");
            // Add the final raw content as a new message if placeholder wasn't found
            conversationHistory.push({ role: 'assistant', content: finalRawContent });
        }

        // Clean up dataset attribute (optional, but good practice)
        delete currentBotMessageDiv.dataset.rawContent;
        currentBotMessageDiv = null; // Mark streaming as finished for this div
        
        // Final application of syntax highlighting in case any code blocks were incompletely processed
        enhanceCodeBlocks(chatHistory.lastElementChild);
    } else {
        console.log("Finalize called but no active bot message div.");
    }
}

// Handle the chat form submission
async function handleFormSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    const message = messageInput.value.trim();
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const persona = personaSelect.value;
    const filesToUpload = combinedFiles; // Get currently staged files

    // Allow submitting *only* files without a message
    if (!message && filesToUpload.length === 0) {
        // Optionally, provide feedback to the user
        // addMessage('error', 'Please type a message or add files to send.');
        return; // Need message or files
    }
    if (!model) {
        addMessage('error', 'Please select a model.');
        return;
    }

    // Display user message (potentially noting attached files)
    // User message is treated as plain text, so use addMessage directly
    let userDisplayMessage = message || "(Sending attached files)"; // Display message or indicator
    if (filesToUpload.length > 0) {
        const fileText = filesToUpload.length === 1 ? 'file' : 'files';
        // Display file count as plain text within the user message bubble
        // Note: addMessage will escape this HTML, so use line break entity
        userDisplayMessage += `\n(Attached ${filesToUpload.length} ${fileText})`;
    }
    addMessage('user', userDisplayMessage); // addMessage handles plain text escaping

    // Only add the *text* message to the conversation history if it exists
    if (message) {
        conversationHistory.push({ role: 'user', content: message });
    }
    messageInput.value = ''; // Clear input field

    setFormDisabled(true); // Disable form controls during request
    // Add placeholder for streaming response (handled by addMessage)
    // The content '...' will be replaced by appendStreamChunk/finalizeBotMessage
    addMessage('assistant', '...', true);
    // Add placeholder to *internal* history (will be updated in finalizeBotMessage)
    conversationHistory.push({ role: 'assistant', content: '...' });

    // Prepare data for the backend
    const formData = new FormData();
    formData.append('message', message); // Send the raw text message
    formData.append('provider', provider);
    formData.append('model', model);
    formData.append('persona', persona);

    // Send history *before* the current user message and the placeholder "..."
    // Ensure history being sent doesn't contain the live '...' placeholder
    const historyForAPI = conversationHistory.slice(0, -2);
    formData.append('history', JSON.stringify(historyForAPI));

    // Append files if any
    if (filesToUpload.length > 0) {
        filesToUpload.forEach(file => {
            const fileName = file.webkitRelativePath || file.name;
            formData.append('files', file, fileName);
            console.log(`Appending file to FormData: ${fileName} (${file.size} bytes)`);
        });
    }

    // Clear the staged files list after adding them to FormData
    combinedFiles = [];
    updateAttachmentNames(); // Update UI to show "No files"

    // --- Make the API call using Server-Sent Events (SSE) ---
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            body: formData // Send the form data
        });

        if (!response.ok) {
            let errorMsg = `HTTP error! Status: ${response.status}`;
            try { // Try to parse potential JSON error from server
                const errorData = await response.json();
                // Check if the parsed data has a 'message' field in the expected event format
                if (errorData && errorData.message) {
                    errorMsg = errorData.message; // Use server-provided message
                } else {
                     // If response isn't the expected JSON error, maybe it's plain text
                     const textError = await response.text(); // Re-read as text
                     if (textError) errorMsg = textError;
                }
            } catch (e) { /* Ignore if response is not JSON */ }
            throw new Error(errorMsg); // Throw the best error message we found
        }


        if (!response.headers.get("content-type")?.includes("text/event-stream")) {
            throw new Error("Server did not respond with an event stream.");
        }

        // Process the event stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer for incomplete messages

        // Clear the visual placeholder "..." before appending chunks
        if (currentBotMessageDiv) {
            currentBotMessageDiv.innerHTML = ''; // Clear the initial '...'
            // Don't reset rawContent here, appendStreamChunk needs it
        }

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log("SSE stream finished.");
                break; // Exit loop when stream ends
            }

            buffer += decoder.decode(value, { stream: true }); // Decode chunk and append to buffer
            let lines = buffer.split('\n'); // Split buffer into lines
            buffer = lines.pop(); // Keep the potentially incomplete last line in the buffer

            for (const line of lines) {
                 if (!line.trim()) continue; // Skip empty lines

                 let eventType = 'message'; // Default event type
                 let dataContent = line;

                 if (line.startsWith('event:')) {
                    eventType = line.substring('event:'.length).trim();
                    // We expect data on the next line for custom events
                    continue; // Don't process the event line itself as data
                 } else if (line.startsWith('data:')) {
                    dataContent = line.substring('data:'.length).trim();
                 } else {
                    // If line doesn't start with event: or data:, treat as default message data
                    // This handles simple streams that don't use the full SSE format strictly
                    console.debug("Received line without 'data:' prefix, treating as data:", line);
                    dataContent = line;
                 }

                 // Now process based on eventType determined from previous line or default
                 if (eventType === 'chunk' || eventType === 'message') { // Handle 'chunk' or default 'message' events
                     try {
                         const data = JSON.parse(dataContent);
                         if (data.content) {
                             appendStreamChunk(data.content); // Append the text chunk
                         } else {
                            console.warn("Received chunk/message event without 'content':", data);
                         }
                     } catch (e) {
                         console.error("Failed to parse SSE data JSON:", dataContent, e);
                         // Maybe the raw line *was* the content if not JSON?
                         // Decide if you want to append non-JSON data:
                         // appendStreamChunk(dataContent); // Uncomment cautiously
                     }
                 } else if (eventType === 'error') {
                     console.error("SSE Error Event Received:", dataContent);
                     try {
                         const errorData = JSON.parse(dataContent);
                         addMessage('error', errorData.message || dataContent);
                     } catch (e) {
                         addMessage('error', dataContent); // Show raw error if not JSON
                     }
                     finalizeBotMessage(); // Finalize before cancelling
                     if (reader) reader.cancel("SSE error received"); // Attempt to cancel the stream reader
                     break; // Exit processing loop on error
                 } else if (eventType === 'end') {
                     console.log("SSE End Event Received:", dataContent);
                     // The 'done' condition of the reader loop handles stream end,
                     // but this event confirms it from the server side.
                     // No action needed here usually, finalize happens after the loop.
                 } else {
                     console.log(`Received unhandled SSE event type '${eventType}':`, dataContent);
                 }

            } // end for loop over lines

            // Check if the stream was cancelled (e.g., by an error event)
            if (reader.cancelled) {
                console.log("SSE reader cancelled.");
                break; // Exit the while loop if cancelled
            }
        } // end while loop

        finalizeBotMessage(); // Finalize the complete message in history after the stream ends naturally

    } catch (error) {
        console.error("Chat request failed:", error);
        // Display the error in the chat interface
        addMessage('error', `Error: ${error.message}`);
        // Ensure any partial bot message is finalized/cleaned up even on error
        finalizeBotMessage();
    } finally {
        setFormDisabled(false); // Re-enable form controls
    }
}

// Clear chat history and file list
function clearChat() {
    if (chatHistory) chatHistory.innerHTML = ''; // Clear UI
    conversationHistory = []; // Clear internal history
    combinedFiles = []; // Clear staged files
    if (attachmentNamesSpan) attachmentNamesSpan.textContent = 'No files or folders added'; // Reset file text
    currentBotMessageDiv = null; // Reset streaming state
    // Add confirmation message (as plain text)
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
        // Check if it's likely from a folder drop (has webkitRelativePath)
        if (combinedFiles[0].webkitRelativePath) {
            attachmentNamesSpan.textContent = `1 file added (from directory)`;
        } else {
            attachmentNamesSpan.textContent = `1 file added: ${combinedFiles[0].name}`;
        }
    } else {
        // Check if all files seem to be from the same directory drop
        const allFromDir = combinedFiles.every(f => f.webkitRelativePath);
        if (allFromDir && combinedFiles[0].webkitRelativePath) {
            // Try to get the root directory name
            const firstPath = combinedFiles[0].webkitRelativePath;
            const dirName = firstPath.split('/')[0]; // Get the first part of the path
            attachmentNamesSpan.textContent = `Directory '${dirName}' added (${numFiles} files)`;
        } else {
            // Mix of files/folders or just multiple files
            const fileNames = combinedFiles.map(file => file.name).join(', ');
            attachmentNamesSpan.textContent = `${numFiles} files added: ${fileNames}`;
        }
    }
}


// Disable or enable form controls and drop zone
function setFormDisabled(disabled) {
    if (sendButton) sendButton.disabled = disabled;
    if (messageInput) messageInput.disabled = disabled;
    if (providerSelect) providerSelect.disabled = disabled;
    if (modelSelect) modelSelect.disabled = disabled;
    if (personaSelect) personaSelect.disabled = disabled;
    if (clearButton) clearButton.disabled = disabled; // Also disable clear during processing

    if (dropZone) {
        // Prevent interaction with drop zone while processing
        dropZone.style.pointerEvents = disabled ? 'none' : 'auto';
        dropZone.style.opacity = disabled ? 0.6 : 1;
    }
}

// --- Drag and Drop Logic ---

// Recursive function to scan directory entries (files and subfolders)
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
                            batchPromises.push(scanDirectoryEntry(subEntry)); // Recurse
                        }
                        try {
                            const fileArrays = await Promise.all(batchPromises);
                            fileArrays.forEach(fileArray => allEntries.push(...fileArray));
                            readEntries(); // Read the next batch
                        } catch (err) {
                            reject(err); // Propagate errors
                        }
                    } else {
                        resolve(allEntries); // No more entries
                    }
                }, err => reject(err)); // Handle readEntries error
            };
            readEntries(); // Start reading
        });
    }
    return []; // Ignore other entry types
}

// Add newly dropped/selected files to the combined list, avoiding duplicates
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

// Only setup listeners if the core elements exist
if (chatForm && messageInput && chatHistory && providerSelect && modelSelect && personaSelect && sendButton && clearButton && dropZone && attachmentNamesSpan) {

    // Provider selection changes
    providerSelect.addEventListener('change', updateModelOptions);

    // Form submission
    chatForm.addEventListener('submit', handleFormSubmit);

    // Clear button
    clearButton.addEventListener('click', clearChat);

    // --- Drag and Drop Event Listeners ---
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation(); /* Keep class */
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
        const files = e.dataTransfer.files; // Fallback
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
                updateAttachmentNames(); // Revert text or show previous count
            }
        } else if (files && files.length > 0) {
            console.log("Processing dropped files using fallback dataTransfer.files API.");
            addNewFiles(Array.from(files));
            updateAttachmentNames();
        } else {
            console.log("No items or files found in drop event.");
            updateAttachmentNames(); // Revert text or show previous count
        }
    });

    // --- Click Listener for File Selection ---
    dropZone.addEventListener('click', () => {
        if (sendButton.disabled) return; // Don't allow click when disabled
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        // fileInput.webkitdirectory = true; // Doesn't work reliably with click()
        fileInput.onchange = (event) => {
            if (event.target.files.length > 0) {
                console.log(`Files selected via click: ${event.target.files.length}`);
                addNewFiles(Array.from(event.target.files));
                updateAttachmentNames();
            }
        };
        fileInput.click();
    });

    // --- Initial Load ---
    fetchConfig();

} else {
    console.error("Initialization failed: One or more required HTML elements not found.");
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error';
    errorDiv.textContent = 'Error: Failed to initialize chat interface elements.';
    if (chatHistory) { chatHistory.appendChild(errorDiv); } else { alert(errorDiv.textContent); }
}

// Remove the placeholder text from the code block
if (document.getElementById('code-block-1')) {
    const codeBlock = document.getElementById('code-block-1');
    const codeElement = codeBlock.querySelector('code');
    if (codeElement) {
        codeElement.textContent = '';
    }
}

// Add language components for common programming languages
document.addEventListener('DOMContentLoaded', () => {
    // Add custom handling for code blocks that might not have language classes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the added element contains code blocks
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