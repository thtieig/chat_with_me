// --- my_chat_app/static/script.js ---
document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const chatHistory = document.getElementById('chat-history');
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    const personaSelect = document.getElementById('persona-select');
    const sendButton = document.getElementById('send-button');
    const clearButton = document.getElementById('clear-button');
    const fileInputField = document.getElementById('file-input-field');
    const fileNamesSpan = document.getElementById('file-names');
    // const interruptButton = document.getElementById('interrupt-button'); // If implementing interrupt

    let currentBotMessageDiv = null; // To append streamed chunks
    let conversationHistory = []; // Store history as {role: 'user'/'assistant', content: '...'}
    let configData = null; // To store config fetched from server
    let eventSource = null; // To hold the EventSource connection

    // --- Fetch Initial Config ---
    async function fetchConfig() {
        try {
            const response = await fetch('/config');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            configData = await response.json();
            // console.log('Config loaded:', configData);
            // (Initial population is now handled by Flask template, but this is useful for dynamic updates)
            updateModelOptions(); // Ensure models are correct based on initial provider
        } catch (error) {
            console.error("Error fetching config:", error);
            addMessage('error', 'Could not load server configuration.');
        }
    }

    // --- Update Model Options ---
    function updateModelOptions() {
        if (!configData) return; // Wait for config

        const selectedProvider = providerSelect.value;
        const providerInfo = configData.providers[selectedProvider];
        modelSelect.innerHTML = ''; // Clear existing options

        if (providerInfo && providerInfo.models) {
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
            // Handle case where provider has no models or info is missing
            const option = document.createElement('option');
            option.textContent = 'No models available';
            option.disabled = true;
            modelSelect.appendChild(option);
        }
    }

    // --- Event Listeners ---
    providerSelect.addEventListener('change', updateModelOptions);

    chatForm.addEventListener('submit', handleFormSubmit);

    clearButton.addEventListener('click', clearChat);

    fileInputField.addEventListener('change', updateFileNames);

    // --- Add Message to UI ---
    function addMessage(role, content, isStreaming = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);

        // Basic sanitization/rendering (Consider a Markdown library like 'marked' for better rendering)
        // WARNING: Directly setting innerHTML from LLM output is risky without strict sanitization.
        // Using textContent is safer but loses formatting.
        // Flask's bleach helps on server-side, but client-side rendering needs care.
        // For now, render basic HTML potentially returned, assuming server sanitized it.
        // Replace newlines with <br> for display
        // content = content.replace(/\n/g, '<br>');
        messageDiv.innerHTML = content; // Be cautious with this

        chatHistory.appendChild(messageDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom

        if (role === 'assistant' && isStreaming) {
            currentBotMessageDiv = messageDiv; // Set for appending chunks
        } else {
             currentBotMessageDiv = null;
             // Add non-streaming messages to history array
             if (role !== 'error') {
                 conversationHistory.push({ role, content });
             }
        }
        return messageDiv; // Return the div in case we need to modify it (e.g., streaming)
    }

     // --- Append Stream Chunk ---
    function appendStreamChunk(chunk) {
        if (currentBotMessageDiv) {
            // Append content, potentially handling markdown or code blocks later
            currentBotMessageDiv.innerHTML += chunk;
            chatHistory.scrollTop = chatHistory.scrollHeight;
        } else {
            // If stream starts unexpectedly, create a new message div
            console.warn("Received stream chunk but no active bot message div. Creating new one.");
            addMessage('assistant', chunk, true);
        }
    }

     // --- Finalize Bot Message ---
     function finalizeBotMessage() {
        if (currentBotMessageDiv) {
             // Add the complete message content to the history array
             const finalContent = currentBotMessageDiv.innerHTML; // Or .textContent if preferred
             conversationHistory.push({ role: 'assistant', content: finalContent });
             currentBotMessageDiv = null; // Reset for next message
        }
     }

    // --- Handle Form Submission ---
    async function handleFormSubmit(event) {
        event.preventDefault(); // Prevent default page reload

        const message = messageInput.value.trim();
        const provider = providerSelect.value;
        const model = modelSelect.value;
        const persona = personaSelect.value;
        const files = fileInputField.files;

        if (!message) return;
        if (!model) {
             addMessage('error', 'Please select a model.');
             return;
        }

        // Add user message to UI and history
        addMessage('user', message);
        messageInput.value = ''; // Clear input field
        fileInputField.value = ''; // Clear file input
        updateFileNames(); // Reset file names display


        // Disable form elements during processing
        setFormDisabled(true);

        // --- Prepare data for sending ---
        const formData = new FormData();
        formData.append('message', message);
        formData.append('provider', provider);
        formData.append('model', model);
        formData.append('persona', persona);
        // Send history as JSON string
        formData.append('history', JSON.stringify(conversationHistory));

        // Append files
        if (files.length > 0) {
             for (let i = 0; i < files.length; i++) {
                 formData.append('files', files[i]);
             }
        }

        // --- Create bot message placeholder ---
        addMessage('assistant', '...', true); // Placeholder while waiting

        // --- Use EventSource for Streaming ---
        const url = '/chat'; // Your Flask endpoint
        eventSource = new EventSource(url + '?' + new URLSearchParams(formData).toString()); // Send data via GET for EventSource (or use POST setup if needed)

        // Correct approach: POST with fetch and read stream, or setup EventSource correctly on server to accept POST or use GET params
        // Using GET with EventSource for simplicity here, requires Flask to read from args if done this way.
        // Sticking to POST: We need fetch, but EventSource is cleaner for SSE events.
        // Let's stick to the POST setup in Flask and use fetch here, reading the stream manually.

        try {
            // Close previous connection if any
            if (eventSource) {
                eventSource.close();
            }

            // Re-establish connection for the new request using POST logic
            // NOTE: EventSource standard doesn't directly support POST bodies.
            // Common workarounds involve fetch API or libraries.
            // We'll use fetch and process the SSE stream manually.

            const response = await fetch('/chat', {
                method: 'POST',
                body: formData,
                // No 'Content-Type' header needed for FormData; browser sets it with boundary
            });

            if (!response.ok) {
                // Try to get error message from body if possible
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json(); // Assuming server sends JSON error
                    errorMsg = errorData.message || errorMsg;
                } catch (e) { /* Ignore if body isn't JSON */ }
                throw new Error(errorMsg);
            }

            // Check content type for streaming
             if (!response.headers.get("content-type")?.includes("text/event-stream")) {
                throw new Error("Expected text/event-stream response");
             }


            // Process the stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Clear the '...' placeholder in the current bot message
            if (currentBotMessageDiv) {
                currentBotMessageDiv.innerHTML = '';
            } else {
                 console.error("currentBotMessageDiv is null when stream started");
                 // Potentially create it again if needed
            }


            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process buffer line by line for SSE messages
                let lines = buffer.split('\n');
                buffer = lines.pop(); // Keep potential partial line in buffer

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        const eventType = line.substring('event: '.length).trim();
                        // Store event type if needed for different handling
                    } else if (line.startsWith('data: ')) {
                        const dataJson = line.substring('data: '.length);
                        try {
                            const data = JSON.parse(dataJson);
                            if (data.content) { // Handle 'chunk' event data
                                appendStreamChunk(data.content);
                            } else if (data.message) { // Handle 'error' or 'end' event data
                                 if (line.includes('event: error')) { // Check based on prior line or structure
                                     console.error("Stream Error:", data.message);
                                     addMessage('error', data.message);
                                     finalizeBotMessage(); // Finalize any previous content before error
                                 } else if (line.includes('event: end')) {
                                     console.log("Stream ended");
                                     finalizeBotMessage(); // Finalize content normally
                                 }
                            }
                        } catch (e) {
                            console.error("Failed to parse SSE data:", dataJson, e);
                        }
                    }
                }
            }
             // Finalize message in case the stream ended without an explicit 'end' event signal (good practice)
             finalizeBotMessage();

        } catch (error) {
            console.error("Chat request failed:", error);
            addMessage('error', `Error: ${error.message}`);
            finalizeBotMessage(); // Ensure any partial message is stored before error msg
        } finally {
            setFormDisabled(false); // Re-enable form
            eventSource = null; // Clear reference
        }
    }

    // --- Clear Chat ---
    function clearChat() {
        chatHistory.innerHTML = ''; // Clear UI
        conversationHistory = []; // Clear internal history
        fileInputField.value = ''; // Clear file input
        updateFileNames();
        addMessage('bot', 'Conversation cleared.'); // Add initial message
         // Optionally close any active stream connection
         if (eventSource) {
             eventSource.close();
             eventSource = null;
             setFormDisabled(false); // Ensure form is re-enabled
             console.log("Active stream connection closed by Clear.");
         }
    }

     // --- Update File Names Display ---
     function updateFileNames() {
        const files = fileInputField.files;
        if (files.length === 0) {
            fileNamesSpan.textContent = 'No files selected';
        } else if (files.length === 1) {
            fileNamesSpan.textContent = files[0].name;
        } else {
            fileNamesSpan.textContent = `${files.length} files selected`;
        }
     }

    // --- Disable/Enable Form ---
    function setFormDisabled(disabled) {
        sendButton.disabled = disabled;
        messageInput.disabled = disabled;
        providerSelect.disabled = disabled;
        modelSelect.disabled = disabled;
        personaSelect.disabled = disabled;
        fileInputField.disabled = disabled; // Disable file input too
        // interruptButton.disabled = !disabled; // Enable interrupt only when sending
    }

    // --- Initial Load ---
    fetchConfig(); // Fetch config when the page loads

});