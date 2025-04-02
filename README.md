# Chat With Me (Flask Version)

A versatile AI chatbot web application built with Python (Flask) for the backend and standard HTML, CSS, and JavaScript for the frontend.

## Features

*   **Web Application:** Runs as a web server using Flask.
*   **Browser-Based UI:** Accessible from any modern web browser (desktop or mobile).
*   **Separation of Concerns:** Backend Python logic is separate from frontend HTML/CSS/JS.
*   **Multi-Provider Support:** Connect to different LLM providers (IONOS, Google, Ollama configured by default).
*   **Dynamic Model Selection:** Available models update automatically in the UI based on the selected provider.
*   **Customizable Personas:** Define different AI personalities or roles using system prompts in `config.yaml`.
*   **File Uploads:** Upload various file types to include their content in the chat context.
*   **Streaming Responses:** See the AI's response generate in real-time using Server-Sent Events (SSE).
*   **Clear Conversation:** Easily reset the chat history.
*   **Development and Production Setup:** Supports both development and production environments with configurable settings.
*   **Improved Error Handling:** Enhanced error handling for better user experience and debugging.

## Project Structure

```bash
chat_with_me/
├── app.py 
├── llm_logic.py 
├── config.yaml 
├── requirements.txt 
├── .env 
├── templates/
│ └── index.html 
└── static/
├── style.css 
├── script.js 
└── favicon.ico 
```

## Installation

1.  Clone the repository:
```bash
git clone https://thtieig@bitbucket.org/thtieig/chat_with_me.git
cd chat_with_me
```

2.  Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  
```

3.  Install dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

1.  **API Keys (`.env` file):**
Create a file named `.env` in the project's root directory. Add your API keys like this:
```dotenv
IONOS_API_KEY=your_ionos_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

2.  **Providers, Models, and Personas (`config.yaml`):**
    Modify the `config.yaml` file to add or remove AI providers, update the list of available models for each provider, define or change AI personas (system prompts).

## Running the Application

1.  Activate your virtual environment (if you created one):
```bash
source venv/bin/activate  
```

2.  Run the Flask development server:
```bash
python app.py
```

3.  Access the UI:
Open your web browser and navigate to `http://127.0.0.1:5000`.

## Usage

1.  Open the web application in your browser.
2.  Select the desired AI **Provider** using the dropdown menu.
3.  The **Model** list will update automatically. Choose a specific model.
4.  Pick an **AI Persona** from the dropdown.
5.  Optionally, click "Attach Files" to select one or more **Files** to provide context.
6.  Type your message in the text area.
7.  Click the **Send** button.
8.  The AI's response will stream into the chat history.
9.  Click the **Clear** button to reset the conversation history and file selection.

Please ensure you have the necessary API keys and configure them properly in the `.env` file before running the application. Also, be aware of the terms of service and usage guidelines for each AI provider you configure.

## Development and Production Setup

The application supports both *development* and *production* environments. You can configure the environment by modifying the `config.yaml` file. DEFAULT is `development`.  

*   **Development Environment:**
    Set `application_mode` to `development` in `config.yaml`. This will enable debug mode and log chat content to the console, and access only to localhost.  
*   **Production Environment:**
    Set `application_mode` to `production` in `config.yaml`. This will disable debug mode and log chat content to a file, access to 0.0.0.0.  

