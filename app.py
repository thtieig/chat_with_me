# --- my_chat_app/app.py ---
import os
import json
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, send_from_directory
from werkzeug.utils import secure_filename # Make sure secure_filename is imported
import logging
import llm_logic # Assuming llm_logic.py is in the same directory or Python path

app = Flask(__name__)
app.secret_key = os.urandom(24) # Needed for potential session usage, good practice

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Favicon Route ---
@app.route('/favicon.ico')
def favicon():
    # Serve favicon from the static directory
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')

# --- Main Page Route ---
@app.route('/')
def index():
    """Renders the main chat page."""
    try:
        providers = list(llm_logic.config['providers'].keys()) if llm_logic.config else []
        personas = list(llm_logic.config['personas'].keys()) if llm_logic.config else []
        initial_provider = providers[0] if providers else None
        initial_models = []
        initial_default_model = None

        if initial_provider and llm_logic.config:
            provider_conf = llm_logic.config['providers'].get(initial_provider, {})
            initial_models = provider_conf.get('models', [])
            initial_default_model = provider_conf.get('default_model')

        return render_template('index.html',
                               providers=providers,
                               personas=personas,
                               initial_models=initial_models,
                               initial_default_model=initial_default_model,
                               initial_provider=initial_provider)
    except Exception as e:
        logging.error(f"Error rendering index page: {e}", exc_info=True)
        # You might want to render an error page or return a simple error message
        return "Error loading chat interface configuration.", 500


# --- Configuration Endpoint for Frontend ---
@app.route('/config')
def get_config():
    """Provides configuration details (providers, models, personas) to the frontend."""
    if not llm_logic.config:
        logging.error("Server configuration (llm_logic.config) not loaded.")
        return jsonify({"error": "Server configuration not loaded"}), 500

    try:
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
    except Exception as e:
        logging.error(f"Error preparing config for frontend: {e}", exc_info=True)
        return jsonify({"error": "Error preparing configuration data."}), 500

# --- Chat Endpoint (Handles Streaming) ---
@app.route('/chat', methods=['POST'])
def chat_endpoint():
    """Handles the chat request, processes files, and streams the response."""
    if not llm_logic.config:
        def error_stream():
            # Format error message according to SSE spec
            yield f"event: error\ndata: {json.dumps({'message': 'Server configuration error.'})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream')

    try:
        # --- Get Form Data ---
        provider = request.form.get('provider')
        model = request.form.get('model')
        persona = request.form.get('persona')
        message = request.form.get('message', '') # Default to empty string if missing
        history_json = request.form.get('history', '[]')

        # Validate required fields
        if not provider or not model or not persona:
            raise ValueError("Missing required fields: provider, model, or persona.")

        # Safely parse history JSON
        try:
            history = json.loads(history_json)
            if not isinstance(history, list):
                 raise ValueError("History must be a JSON list.")
        except json.JSONDecodeError:
            logging.warning("Failed to decode history JSON.")
            raise ValueError("Invalid history format received.")

        # --- Process Uploaded Files ---
        # *** MODIFICATION START ***
        files_data = [] # List to hold (stream, filename) tuples
        raw_files = request.files.getlist('files') # Get list of FileStorage objects

        if raw_files:
            logging.info(f"Received {len(raw_files)} file item(s). Processing...")
            for file_storage in raw_files:
                # Check if the file object and filename actually exist
                if file_storage and file_storage.filename:
                    # Sanitize filename to prevent directory traversal or invalid chars
                    filename = secure_filename(file_storage.filename)
                    if filename: # Ensure filename is not empty after sanitization
                        logging.info(f"Processing file: {filename} (Content-Type: {file_storage.content_type}, Size: {file_storage.content_length} bytes)")
                        # Append the stream and the secured filename
                        files_data.append((file_storage.stream, filename))
                    else:
                        logging.warning(f"Skipping file with potentially unsafe name before sanitization: '{file_storage.filename}'")
                else:
                     # This can happen if an empty file input is part of the form submission
                     logging.debug("Received an empty file item, skipping.")

        # *** MODIFICATION END ***

        # --- Define the Streaming Response Generator ---
        def generate_response():
            """Calls the LLM logic and yields SSE formatted chunks."""
            try:
                logging.info(f"Calling stream_question for provider={provider}, model={model}, persona={persona}, history_len={len(history)}, files_count={len(files_data)}")
                # Pass the processed files_data list
                stream = llm_logic.stream_question(
                    provider=provider,
                    model=model,
                    persona=persona,
                    history=history,
                    prompt=message,
                    files=files_data, # Use the list of (stream, filename) tuples
                    config_data=llm_logic.config
                )

                chunk_count = 0
                for chunk in stream:
                    chunk_count += 1
                    # Check if the chunk indicates an error yielded by stream_question
                    if chunk.startswith("Error:"):
                         logging.warning(f"Received error chunk from llm_logic: {chunk}")
                         yield f"event: error\ndata: {json.dumps({'message': chunk})}\n\n"
                         return # Stop streaming on error from logic layer

                    # Send normal content chunk
                    #logging.debug(f"Yielding chunk {chunk_count}") # Very verbose
                    yield f"event: chunk\ndata: {json.dumps({'content': chunk})}\n\n"

                # Signal the end of the stream
                logging.info(f"Stream finished successfully after {chunk_count} chunks.")
                yield f"event: end\ndata: {json.dumps({'message': 'Stream ended'})}\n\n"

            except Exception as e:
                # Catch errors specifically from the stream_question call or yield loop
                logging.error(f"Error during streaming generation in generate_response: {e}", exc_info=True)
                # Send SSE formatted error
                error_payload = json.dumps({'message': f'Error during response generation: {str(e)}'})
                yield f"event: error\ndata: {error_payload}\n\n"

        # Return the streaming response
        headers = {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
        return Response(stream_with_context(generate_response()), headers=headers)

    # --- Error Handling for the Endpoint ---
    except ValueError as ve: # Catch validation errors (missing fields, bad JSON)
        logging.warning(f"Value Error in /chat request: {ve}")
        def error_stream():
            yield f"event: error\ndata: {json.dumps({'message': str(ve)})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream'), 400 # Bad Request
    except Exception as e:
        # Catch any other unexpected errors during request processing
        logging.error(f"Unexpected error in /chat endpoint before streaming started: {e}", exc_info=True)
        def error_stream():
            yield f"event: error\ndata: {json.dumps({'message': 'An unexpected server error occurred.'})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream'), 500 # Internal Server Error

# --- Main Execution ---
if __name__ == '__main__':
    # Use debug=True only for development, set to False for production
    # Use host='0.0.0.0' to make accessible on the network
    app.run(host='0.0.0.0', port=5000, debug=True)