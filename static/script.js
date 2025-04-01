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

// State variables
let currentBotMessageDiv = null;
let conversationHistory = [];
let configData = null;
let combinedFiles = []; // Holds File objects to be uploaded

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
        // Handle case where no models are defined or provider info is missing
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
    messageDiv.classList.add('message', role); // e.g., 'message user', 'message bot', 'message error'

    // Sanitize HTML content before inserting (important for bot responses)
    // Basic sanitization (replace newline with <br>) is done here,
    // more complex sanitization should happen server-side or use a robust library.
    // For user messages, we generally display what they typed.
    // For bot messages, we expect potentially formatted text.
    messageDiv.innerHTML = content.replace(/\n/g, '<br>');

    chatHistory.appendChild(messageDiv);
    // Scroll to the bottom
    chatHistory.scrollTop = chatHistory.scrollHeight;

    if (role === 'assistant' && isStreaming) {
        // Keep track of the div being actively streamed into
        currentBotMessageDiv = messageDiv;
        // Initialize raw content dataset property
        currentBotMessageDiv.dataset.rawContent = '';
    } else {
        currentBotMessageDiv = null; // No longer streaming into this div
        // Add non-streaming or non-assistant messages to the history array
        if (role !== 'error') { // Don't store errors in the LLM history
            conversationHistory.push({ role, content });
        }
    }
    return messageDiv; // Return the created element
}

// Append a chunk of text to the currently streaming bot message
function appendStreamChunk(chunk) {
    if (currentBotMessageDiv) {
        // Append raw chunk to dataset
        currentBotMessageDiv.dataset.rawContent += chunk;
        // Format for display (newlines, basic code blocks)
        let formattedContent = currentBotMessageDiv.dataset.rawContent.replace(/\n/g, '<br>');
        // Very basic markdown-like code block handling
        formattedContent = formattedContent.replace(/```([\s\S]*?)```/gs, (match, p1) => `<pre><code>${p1.trim().replace(/<br>/g, '\n')}</code></pre>`);
        formattedContent = formattedContent.replace(/`([^`]+)`/g, '<code>$1</code>');
        currentBotMessageDiv.innerHTML = formattedContent;
        // Keep scrolled to bottom
        chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
        // If streaming starts unexpectedly, create a new message div
        console.warn("Received stream chunk but no active bot message div. Creating new one.");
        addMessage('assistant', chunk, true); // Start a new streaming message
        if (currentBotMessageDiv) {
             // Make sure dataset is initialized even in this edge case
            currentBotMessageDiv.dataset.rawContent = chunk;
        }
    }
}

// Finalize the bot message after streaming ends
function finalizeBotMessage() {
    if (currentBotMessageDiv) {
        const finalContent = currentBotMessageDiv.dataset.rawContent || currentBotMessageDiv.innerHTML; // Get the complete raw text

        // Find the placeholder "..." message in history and update it
        const lastMsgIndex = conversationHistory.length - 1;
        if (lastMsgIndex >= 0 && conversationHistory[lastMsgIndex].role === 'assistant' && conversationHistory[lastMsgIndex].content === '...') {
            conversationHistory[lastMsgIndex].content = finalContent; // Update the history
        } else {
            // Should not happen if placeholder was added correctly, but handle defensively
            conversationHistory.push({ role: 'assistant', content: finalContent });
        }

        // Clean up dataset attribute
        delete currentBotMessageDiv.dataset.rawContent;
        currentBotMessageDiv = null; // Mark streaming as finished
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

    if (!message && filesToUpload.length === 0) return; // Need message or files
    if (!model) {
        addMessage('error', 'Please select a model.');
        return;
    }

    // Display user message (potentially noting attached files)
    let userDisplayMessage = message || "(Sending attached files)"; // Display message or indicator
    if (filesToUpload.length > 0) {
        const fileText = filesToUpload.length === 1 ? 'file' : 'files';
        userDisplayMessage += `<br><small><i>(${filesToUpload.length} ${fileText} attached)</i></small>`;
    }
    addMessage('user', userDisplayMessage);
    if (message) { // Only add the text message to history if it exists
        conversationHistory.push({ role: 'user', content: message });
    }
    messageInput.value = ''; // Clear input field

    setFormDisabled(true); // Disable form controls during request
    addMessage('assistant', '...', true); // Add placeholder for streaming response
    conversationHistory.push({ role: 'assistant', content: '...' }); // Add placeholder to history

    // Prepare data for the backend
    const formData = new FormData();
    formData.append('message', message); // Send the text message
    formData.append('provider', provider);
    formData.append('model', model);
    formData.append('persona', persona);

    // Send history *before* the current user message and the placeholder "..."
    const historyForAPI = conversationHistory.slice(0, -2);
    formData.append('history', JSON.stringify(historyForAPI));

    // Append files if any
    if (filesToUpload.length > 0) {
        filesToUpload.forEach(file => {
            // Use webkitRelativePath if available (for folders), otherwise just name
            const fileName = file.webkitRelativePath || file.name;
            formData.append('files', file, fileName); // Append each file
            console.log(`Appending file to FormData: ${fileName} (${file.size} bytes)`);
        });
    }

    // Clear the staged files list after adding them to FormData
    combinedFiles = [];
    updateAttachmentNames(); // Update UI to show "No files"

    // --- Make the API call using Server-Sent Events (SSE) ---
    try {
        // Use fetch API to connect to the /chat endpoint
        const response = await fetch('/chat', {
            method: 'POST',
            body: formData // Send the form data
        });

        // Check if the response is OK and is an event stream
        if (!response.ok) {
            let errorMsg = `HTTP error! Status: ${response.status}`;
            try {
                const errorData = await response.json(); // Try to get error details from JSON response
                errorMsg = errorData.message || errorMsg;
            } catch (e) { /* Ignore if response is not JSON */ }
            throw new Error(errorMsg);
        }

        if (!response.headers.get("content-type")?.includes("text/event-stream")) {
            throw new Error("Server did not respond with an event stream.");
        }

        // Process the event stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer for incomplete messages

        if (currentBotMessageDiv) { // Clear the placeholder "..."
            currentBotMessageDiv.innerHTML = '';
            currentBotMessageDiv.dataset.rawContent = '';
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
                if (line.startsWith('event: ')) {
                    const eventType = line.substring('event: '.length).trim();
                    // Handle different event types if needed (e.g., 'chunk', 'end', 'error')
                    console.log("SSE event:", eventType);

                } else if (line.startsWith('data: ')) {
                    const dataJson = line.substring('data: '.length).trim();
                    try {
                        const data = JSON.parse(dataJson);
                        if (data.content) {
                            // It's a content chunk, append it
                            appendStreamChunk(data.content);
                        } else if (data.message) {
                            // Could be an end message or an error message from the stream
                            console.log("SSE data message:", data.message);
                            if (line.includes('"event": "error"')) { // Check if it's an error event
                                throw new Error(data.message); // Throw error to be caught below
                            }
                            // If it's an 'end' event message, we just log it, loop will exit on 'done'.
                        }
                    } catch (e) {
                        console.warn("Failed to parse SSE data JSON:", dataJson, e);
                        // Handle JSON parsing error, maybe display a generic error message
                        addMessage('error', 'Received malformed data from server.');
                    }
                }
            }
            // Check if the stream was explicitly cancelled (e.g., by an error)
            if (reader.cancelled) {
                console.log("SSE reader cancelled.");
                break;
            }
        } // end while loop

        finalizeBotMessage(); // Finalize the complete message in history

    } catch (error) {
        console.error("Chat request failed:", error);
        addMessage('error', `Error: ${error.message}`);
        finalizeBotMessage(); // Ensure any partial message is handled/finalized
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
    addMessage('bot', 'Conversation cleared.'); // Add confirmation message
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
            attachmentNamesSpan.textContent = `${numFiles} files/items added`;
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
        // If it's a file, get the File object
        return new Promise((resolve, reject) => {
            entry.file(file => resolve([file]), err => reject(err));
        });
    } else if (entry.isDirectory) {
        // If it's a directory, read its entries
        let reader = entry.createReader();
        let allEntries = [];
        return new Promise((resolve, reject) => {
            const readEntries = async () => {
                reader.readEntries(async (entries) => {
                    if (entries.length > 0) {
                        // Process batch of entries
                        const batchPromises = [];
                        for (const subEntry of entries) {
                            batchPromises.push(scanDirectoryEntry(subEntry)); // Recurse
                        }
                        try {
                            // Wait for all entries in this batch to be processed
                            const filesFromBatch = await Promise.all(batchPromises);
                            // Flatten the results (as scanDirectoryEntry returns arrays)
                            filesFromBatch.forEach(fileArray => allEntries.push(...fileArray));
                            // Read the next batch
                            readEntries();
                        } catch (err) {
                            reject(err); // Propagate errors
                        }
                    } else {
                        // No more entries in this directory
                        resolve(allEntries);
                    }
                }, err => reject(err)); // Handle readEntries error
            };
            readEntries(); // Start reading
        });
    }
    // Ignore other entry types (like symlinks)
    return [];
}

// Add newly dropped/selected files to the combined list, avoiding duplicates
function addNewFiles(newFiles) {
    const uniqueNewFiles = newFiles.filter(newFile =>
        !combinedFiles.some(existingFile =>
            // Basic duplicate check based on name, size, last modified, and relative path
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

    // Fired when an item is dragged INTO the drop zone
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault(); // Necessary to allow drop
        e.stopPropagation();
        dropZone.classList.add('dragover'); // Add visual feedback
    });

    // Fired continuously while an item is dragged OVER the drop zone
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow drop
        e.stopPropagation();
        // You could add other effects here if needed
    });

    // Fired when an item is dragged OUT of the drop zone
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only remove the visual feedback if the drag leaves the dropzone entirely,
        // not just moving over a child element.
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('dragover');
        }
    });

    // *** Fired when an item is DROPPED onto the drop zone ***
    dropZone.addEventListener('drop', async (e) => {
        console.log("Drop event fired!");
        e.preventDefault(); // *** CRITICAL: Prevent browser default action (opening file) ***
        e.stopPropagation();
        dropZone.classList.remove('dragover'); // Remove visual feedback
        attachmentNamesSpan.textContent = 'Processing dropped items...'; // Update status

        const items = e.dataTransfer.items;
        const files = e.dataTransfer.files;
        const droppedFiles = [];
        const promises = [];

        // Prefer DataTransferItems API for folder support (Chrome/Edge/etc.)
        if (items && items.length > 0 && items[0].webkitGetAsEntry) {
            console.log("Processing dropped items using webkitGetAsEntry API.");
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) {
                    promises.push(scanDirectoryEntry(entry)); // Scan file or directory
                } else {
                    console.warn("Could not get entry for item:", items[i]);
                }
            }

            try {
                const fileArrays = await Promise.all(promises); // Wait for all scans
                fileArrays.forEach(fileArray => droppedFiles.push(...fileArray)); // Collect all files
                console.log(`Processed ${droppedFiles.length} files from dropped items.`);
                addNewFiles(droppedFiles); // Add processed files to our list
                updateAttachmentNames(); // Update UI
            } catch (error) {
                console.error('Error processing dropped items:', error);
                attachmentNamesSpan.textContent = 'Error processing items.';
                addMessage('error', `Error processing dropped items: ${error.message}`);
                updateAttachmentNames(); // Show previous file count or error
            }
        }
        // Fallback to DataTransfer.files API (works for files, not folders)
        else if (files && files.length > 0) {
            console.log("Processing dropped files using dataTransfer.files API.");
            addNewFiles(Array.from(files)); // Add files directly
            updateAttachmentNames(); // Update UI
        } else {
            console.log("No items or files found in drop event.");
            updateAttachmentNames(); // Update UI (likely back to 'No files')
        }
    });

    // --- Click Listener for File Selection ---
    dropZone.addEventListener('click', () => {
        // Don't allow clicking if the form is disabled
        if (sendButton.disabled) return;

        // Create a hidden file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true; // Allow selecting multiple files
        // Note: We cannot reliably trigger a *folder* selection dialog programmatically.
        // fileInput.webkitdirectory = true; // This attribute works on the element, but not via click()

        // Add event listener for when files are selected
        fileInput.onchange = (event) => {
            if (event.target.files.length > 0) {
                console.log(`Files selected via click: ${event.target.files.length}`);
                addNewFiles(Array.from(event.target.files)); // Add the selected files
                updateAttachmentNames(); // Update UI
            }
        };

        fileInput.click(); // Programmatically click the hidden input
    });

    // --- Initial Load ---
    fetchConfig(); // Load configuration from server on page load

} else {
    // Critical elements are missing, log an error and inform the user
    console.error("Initialization failed: One or more required HTML elements not found.");
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message error'; // Use existing error styling
    errorDiv.textContent = 'Error: Failed to initialize chat interface elements. Please check the HTML structure or report the issue.';
    if (chatHistory) {
        chatHistory.appendChild(errorDiv);
    } else {
        // Fallback if even chatHistory is missing
        alert('Error: Failed to initialize chat interface elements.');
    }
}