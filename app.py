# --- my_chat_app/app.py ---
import os
import json
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, send_from_directory
from werkzeug.utils import secure_filename
import logging

# Import logic from our other file
import llm_logic

# Basic Flask App Setup
app = Flask(__name__)
app.secret_key = os.urandom(24) # Needed for session management if you add login

# Configure logging (optional, can rely on llm_logic's setup)
# logging.basicConfig(level=logging.INFO)

# --- Routes ---

@app.route('/')
def index():
    """Render the main chat page."""
    # Pass initial config needed for the UI (providers, personas)
    providers = list(llm_logic.config['providers'].keys()) if llm_logic.config else []
    personas = list(llm_logic.config['personas'].keys()) if llm_logic.config else []
    initial_provider = providers[0] if providers else None
    initial_models = []
    initial_default_model = None
    if initial_provider and llm_logic.config:
        initial_models = llm_logic.config['providers'][initial_provider].get('models', [])
        initial_default_model = llm_logic.config['providers'][initial_provider].get('default_model')

    # Check if config loaded correctly
    if not llm_logic.config:
        return "Error: Server configuration failed to load.", 500

    return render_template('index.html',
                           providers=providers,
                           personas=personas,
                           initial_models=initial_models,
                           initial_default_model=initial_default_model,
                           initial_provider=initial_provider)

@app.route('/config')
def get_config():
    """Provide necessary frontend configuration."""
    if not llm_logic.config:
         return jsonify({"error": "Server configuration not loaded"}), 500

    # Send only necessary parts of the config to the frontend
    frontend_config = {
        "providers": {},
        "personas": list(llm_logic.config.get('personas', {}).keys())
    }
    for name, conf in llm_logic.config.get('providers', {}).items():
        frontend_config["providers"][name] = {
            "models": conf.get('models', []),
            "default_model": conf.get('default_model')
        }
    return jsonify(frontend_config)


@app.route('/chat', methods=['POST'])
def chat_endpoint():
    """Handle chat requests, process files, and stream response."""
    if not llm_logic.config:
         # Use Server-Sent Events (SSE) format for errors too
         def error_stream():
             yield f"event: error\ndata: {json.dumps({'message': 'Server configuration error.'})}\n\n"
         return Response(error_stream(), mimetype='text/event-stream')

    try:
        # --- Extract data from the POST request ---
        # Use request.form for text fields when using FormData
        provider = request.form.get('provider')
        model = request.form.get('model')
        persona = request.form.get('persona')
        message = request.form.get('message')
        # History comes as a JSON string from JS
        history_json = request.form.get('history', '[]')
        history = json.loads(history_json) # Deserialize JSON history

        # --- Handle File Uploads ---
        files = request.files.getlist('files') # Get list of uploaded files matching the name 'files'
        processed_files = []
        if files:
            for file in files:
                 if file and file.filename: # Basic check
                    # Secure the filename before potentially saving or using it
                    # filename = secure_filename(file.filename)
                    # In this case, we process in memory, so securing might be less critical
                    # but good practice if you were saving it.
                    logging.info(f"Received file: {file.filename} ({file.content_type})")
                    processed_files.append(file) # Add the FileStorage object

        # --- Basic Validation ---
        if not message or not provider or not model or not persona:
            raise ValueError("Missing required fields: message, provider, model, or persona.")
        if not isinstance(history, list):
             raise ValueError("Invalid history format.")


        # --- Define the streaming generator using stream_with_context ---
        # Use Server-Sent Events (SSE) format for easier JS handling
        def generate_response():
            try:
                logging.info(f"Streaming request: P={provider}, M={model}, Ps={persona}")
                stream = llm_logic.stream_question(
                    provider=provider,
                    model=model,
                    persona=persona,
                    history=history,
                    prompt=message,
                    files=processed_files, # Pass the list of FileStorage objects
                    config_data=llm_logic.config
                )
                for chunk in stream:
                    # Format as Server-Sent Event
                    # Send 'chunk' events for normal text
                    yield f"event: chunk\ndata: {json.dumps({'content': chunk})}\n\n"
                # Send an 'end' event when the stream is finished naturally
                yield f"event: end\ndata: {json.dumps({'message': 'Stream ended'})}\n\n"
            except Exception as e:
                logging.error(f"Error during streaming generation: {e}", exc_info=True)
                # Send an 'error' event
                yield f"event: error\ndata: {json.dumps({'message': f'Error during generation: {str(e)}'})}\n\n"

        # Return the streaming response
        # Use text/event-stream mimetype for SSE
        return Response(stream_with_context(generate_response()), mimetype='text/event-stream')

    except ValueError as ve:
         logging.warning(f"Value Error in /chat: {ve}")
         def error_stream():
             yield f"event: error\ndata: {json.dumps({'message': str(ve)})}\n\n"
         return Response(error_stream(), mimetype='text/event-stream'), 400 # Bad Request
    except json.JSONDecodeError:
        logging.warning("Failed to decode history JSON")
        def error_stream():
             yield f"event: error\ndata: {json.dumps({'message': 'Invalid history format received.'})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream'), 400 # Bad Request
    except Exception as e:
        logging.error(f"Unexpected error in /chat endpoint: {e}", exc_info=True)
        def error_stream():
             yield f"event: error\ndata: {json.dumps({'message': 'An unexpected server error occurred.'})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream'), 500 # Internal Server Error


# --- Favicon Route (Optional, avoids 404 errors in browser console) ---
@app.route('/favicon.ico')
def favicon():
    # Serve a dummy file or your actual favicon
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')

# --- Main Execution ---
if __name__ == '__main__':
    # Use 0.0.0.0 to make it accessible on your network
    # Use debug=True only for development, it's insecure for production
    app.run(host='0.0.0.0', port=5000, debug=True)