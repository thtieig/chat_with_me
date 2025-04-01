# Chat With Me (Flask Version)

A versatile AI chatbot web application built with Python (Flask) for the backend and standard HTML, CSS, and JavaScript for the frontend. This version provides more control and flexibility compared to UI frameworks like Gradio. It allows you to connect to various AI providers (like IONOS, Google, Ollama), select different AI models and personas, and upload files for context.

## Features

*   **Web Application:** Runs as a web server using Flask.
*   **Browser-Based UI:** Accessible from any modern web browser (desktop or mobile).
*   **Separation of Concerns:** Backend Python logic is separate from frontend HTML/CSS/JS.
*   **Multi-Provider Support:** Connect to different LLM providers (IONOS, Google, Ollama configured by default). Easily extendable via `config.yaml`.
*   **Dynamic Model Selection:** Available models update automatically in the UI based on the selected provider.
*   **Customizable Personas:** Define different AI personalities or roles using system prompts in `config.yaml`.
*   **File Uploads:** Upload various file types (Text, Code, DOCX, PDF, CSV, Excel, JSON, XML, ZIP) to include their content in the chat context.
*   **Streaming Responses:** See the AI's response generate in real-time using Server-Sent Events (SSE).
*   **Clear Conversation:** Easily reset the chat history.
*   **Configurable:** Settings managed through `config.yaml` and sensitive keys via a `.env` file.

## Project Structure

```
chat_with_me/
├── app.py # Main Flask application routes and server logic
├── llm_logic.py # Core AI provider logic, file processing, streaming
├── config.yaml # Provider, model, persona configuration
├── requirements.txt # Python dependencies (Flask, OpenAI, etc.)
├── .env # API keys and sensitive configuration (should be gitignored)
├── templates/
│ └── index.html # Main HTML structure for the chat interface
└── static/
├── style.css # CSS styles for the interface
├── script.js # Frontend JavaScript for interactivity (fetching, streaming)
└── favicon.ico # Optional: Favicon for the browser tab
```

## Prerequisites

*   Python 3.8+
*   `pip` (Python package installer)
*   API Keys for the desired providers (e.g., IONOS, Google). Get these from the respective provider websites.
*   If using Ollama: A running Ollama instance accessible at the URL specified in `config.yaml` (default: `http://localhost:11434/v1`).

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://thtieig@bitbucket.org/thtieig/chat_with_me.git
    cd chat_with_me
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Configuration

1.  **API Keys (`.env` file):**
    Create a file named `.env` in the project's root directory. Add your API keys like this:
    ```dotenv
    # .env example
    IONOS_API_KEY=your_ionos_api_key_here
    GOOGLE_API_KEY=your_google_api_key_here
    # OLLAMA_BASE_URL=http://custom_host:11434/v1 # Optional: Override Ollama URL if needed
    ```

2.  **Providers, Models, and Personas (`config.yaml`):**
    Modify the `config.yaml` file to:
    *   Add or remove AI providers.
    *   Update the list of available models for each provider.
    *   Define or change AI personas (system prompts).
    *   Adjust HTML sanitization rules if needed.

## Running the Application

1.  **Activate your virtual environment (if you created one):**
    ```bash
    source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
    ```

2.  **Run the Flask development server:**
    ```bash
    python app.py
    ```
    This will typically start the server on `http://127.0.0.1:5000` or `http://0.0.0.0:5000`. The `0.0.0.0` address makes it accessible from other devices on your local network.

3.  **Access the UI:**
    Open your web browser and navigate to the URL provided in the terminal output (e.g., `http://127.0.0.1:5000`).

4.  **(Optional) Running with Gunicorn (for production-like setup):**
    Install Gunicorn if you haven't (`pip install gunicorn`). Then run:
    ```bash
    gunicorn -w 4 -b 0.0.0.0:8000 app:app
    ```
    *   `-w 4`: Specifies 4 worker processes. Adjust based on your server.
    *   `-b 0.0.0.0:8000`: Binds the server to port 8000 on all network interfaces.
    *   `app:app`: Tells Gunicorn to load the Flask application instance named `app` from the `app.py` file.
    Access the UI at `http://<your-server-ip>:8000`.

## Usage

1.  Open the web application in your browser.
2.  Select the desired AI **Provider** using the dropdown menu.
3.  The **Model** list will update automatically. Choose a specific model.
4.  Pick an **AI Persona** from the dropdown.
5.  Optionally, click "Attach Files" to select one or more **Files** to provide context. The number of selected files will be displayed.
6.  Type your message in the text area.
7.  Click the **Send** button.
8.  The AI's response will stream into the chat history.
9.  Click the **Clear** button to reset the conversation history and file selection.