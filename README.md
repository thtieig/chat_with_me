# Chat With Me (Flask Version)
=====================================

A versatile AI chatbot web application built with Python (Flask) for the backend and standard HTML, CSS, and JavaScript for the frontend.

## Features
------------

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
-------------------

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
------------

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
-------------

The application is configured using the `config.yaml` file, which is located in the project's root directory. This file contains settings for the application, including API keys, providers, models, and personas.

### Config File Location

The `config.yaml` file is located in the project's root directory. You can find it at the same level as the `app.py` and `requirements.txt` files.

### API Keys

Create a file named `.env` in the project's root directory. Add your API keys like this:
```dotenv
IONOS_API_KEY=your_ionos_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

### Providers, Models, Personas, and Environment

The `config.yaml` file contains settings for the providers, models, personas, and environment. You can add or remove providers, update the list of available models for each provider, define or change AI personas (system prompts), and set the `application_mode` to `production` once you're happy with the script.

#### Common Instructions

The `common_instructions` section in the `config.yaml` file defines a set of common instructions that are added to each persona. These instructions are used to guide the AI's behavior and response style. For example, the `common_instructions` section might contain the following:
```yml
common_instructions: |
  Think carefully and say 'I don't know' if unsure.
  Unless asked differently, you always reply in British English.
```
This means that every persona will be prefixed with these instructions, which helps to ensure consistency in the AI's responses.

#### Personas

The `personas` section in the `config.yaml` file defines a list of available personas. Each persona is a system prompt that defines the AI's personality or role. For example, the `personas` section might contain the following:
```yml
personas:
  Default: |
    You are a helpful assistant who thinks before answering and says 'I don't know' if unsure.
  Web Developer Expert: |
    You are a skilled Web developer with expertise in HTML, CSS, and Javascript.
    Provide high-quality code solutions, guide users on best practices, and troubleshoot common issues.
```
These personas can be selected in the UI, and the AI will respond accordingly.

#### Development Environment

*   Set `application_mode` to `development` in `config.yaml`.
*   This will enable debug mode and log chat content to the console.
*   Access is restricted to localhost.

#### Production Environment

*   Set `application_mode` to `production` in `config.yaml`.
*   This will disable debug mode and log chat content to a file.
*   Access is available on `0.0.0.0`.

## Running the Application
-------------------------

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
-----

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

## License
-------
This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
