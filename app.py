# --- my_chat_app/app.py ---
import os
import json
import yaml
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, send_from_directory
from werkzeug.utils import secure_filename
import logging
import llm_logic  # Assuming llm_logic.py is in the same directory or Python path

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Needed for potential session usage, good practice

# Load configuration from config.yaml
def load_config():
    config_path = os.path.join(app.root_path, 'config.yaml')
    try:
        with open(config_path, 'r') as file:
            return yaml.safe_load(file)
    except Exception as e:
        print(f"Error loading config.yaml: {e}")
        return {"log_chat_to_console": False, "log_level": "INFO"}

# Global app configuration (separate from llm_logic.config)
app_config = load_config()

# Set up logging based on config
LOG_CHAT_TO_CONSOLE = app_config.get('log_chat_to_console', False)
LOG_LEVEL_STR = app_config.get('log_level', 'INFO').upper()
LOG_LEVEL = getattr(logging, LOG_LEVEL_STR, logging.INFO)

logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Console handler
    ]
)
logger = logging.getLogger(__name__)  # Get a logger for this module

logger.info(f"Application starting with log_chat_to_console={LOG_CHAT_TO_CONSOLE}, log_level={LOG_LEVEL_STR}")

# Helper function to log chat content
def log_chat_content(role, content):
    """Log chat content if log_chat_to_console is enabled in config"""
    if LOG_CHAT_TO_CONSOLE:
        formatted_content = f"\n{'='*40}\n{role.upper()}: {content}\n{'='*40}"
        logger.info(formatted_content)

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
            
        logger.info("Main page loaded with configuration")
        return render_template('index.html',
                               providers=providers,
                               personas=personas,
                               initial_models=initial_models,
                               initial_default_model=initial_default_model,
                               initial_provider=initial_provider)
    except Exception as e:
        logger.error(f"Error rendering index page: {e}", exc_info=True)
        # You might want to render an error page or return a simple error message
        return "Error loading chat interface configuration.", 500


# --- Configuration Endpoint for Frontend ---
@app.route('/config')
def get_config():
    """Provides configuration details (providers, models, personas) to the frontend."""
    if not llm_logic.config:
        logger.error("Server configuration (llm_logic.config) not loaded.")
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
        logger.debug(f"Sending config to frontend: {frontend_config}")
        return jsonify(frontend_config)
    except Exception as e:
        logger.error(f"Error preparing config for frontend: {e}", exc_info=True)
        return jsonify({"error": "Error preparing configuration data."}), 500

# --- Chat Endpoint (Handles Streaming) ---
@app.route('/chat', methods=['POST'])
def chat_endpoint():
    """Handles the chat request, processes files, and streams the response."""
    if not llm_logic.config:
        def error_stream():
            # Format error message according to SSE spec
            error_msg = "Server configuration error."
            logger.error(error_msg)
            yield f"event: error\ndata: {json.dumps({'message': error_msg})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream')

    try:
        # --- Get Form Data ---
        provider = request.form.get('provider')
        model = request.form.get('model')
        persona = request.form.get('persona')
        message = request.form.get('message', '')  # Default to empty string if missing
        history_json = request.form.get('history', '[]')

        # Log user message to console (if enabled)
        log_chat_content("User", message)
        
        # Validate required fields
        if not provider or not model or not persona:
            raise ValueError("Missing required fields: provider, model, or persona.")

        # Safely parse history JSON
        try:
            history = json.loads(history_json)
            if not isinstance(history, list):
                 raise ValueError("History must be a JSON list.")
        except json.JSONDecodeError:
            logger.warning("Failed to decode history JSON.")
            raise ValueError("Invalid history format received.")

        # --- Process Uploaded Files ---
        files_data = []  # List to hold (stream, filename) tuples
        raw_files = request.files.getlist('files')  # Get list of FileStorage objects

        if raw_files:
            logger.info(f"Received {len(raw_files)} file item(s). Processing...")
            for file_storage in raw_files:
                # Check if the file object and filename actually exist
                if file_storage and file_storage.filename:
                    # Sanitize filename to prevent directory traversal or invalid chars
                    filename = secure_filename(file_storage.filename)
                    if filename:  # Ensure filename is not empty after sanitization
                        logger.info(f"Processing file: {filename} (Content-Type: {file_storage.content_type}, Size: {file_storage.content_length} bytes)")
                        # Append the stream and the secured filename
                        files_data.append((file_storage.stream, filename))
                    else:
                        logger.warning(f"Skipping file with potentially unsafe name before sanitization: '{file_storage.filename}'")
                else:
                     # This can happen if an empty file input is part of the form submission
                     logger.debug("Received an empty file item, skipping.")

        # --- Define the Streaming Response Generator ---
        def generate_response():
            """Calls the LLM logic and yields SSE formatted chunks."""
            full_response = ""  # To collect the complete response for logging
            
            try:
                logger.info(f"Calling stream_question for provider={provider}, model={model}, persona={persona}, history_len={len(history)}, files_count={len(files_data)}")
                #
                # Pass the processed files_data list
                stream = llm_logic.stream_question(
                    provider=provider,
                    model=model,
                    persona=persona,
                    history=history,
                    prompt=message,
                    files=files_data,  # Use the list of (stream, filename) tuples
                    config_data=llm_logic.config
                )

                chunk_count = 0
                for chunk in stream:
                    chunk_count += 1
                    # Check if the chunk indicates an error yielded by stream_question
                    if chunk.startswith("Error:"):
                         logger.warning(f"Received error chunk from llm_logic: {chunk}")
                         yield f"event: error\ndata: {json.dumps({'message': chunk})}\n\n"
                         return  # Stop streaming on error from logic layer

                    # Collect chunks for full response logging
                    full_response += chunk
                    
                    # Send normal content chunk
                    logger.debug(f"Yielding chunk {chunk_count}")  # Very verbose
                    yield f"event: chunk\ndata: {json.dumps({'content': chunk})}\n\n"

                # Signal the end of the stream
                logger.info(f"Stream finished successfully after {chunk_count} chunks.")
                
                # Log the complete response (if enabled)
                log_chat_content("Assistant", full_response)
                
                yield f"event: end\ndata: {json.dumps({'message': 'Stream ended'})}\n\n"

            except Exception as e:
                # Catch errors specifically from the stream_question call or yield loop
                logger.error(f"Error during streaming generation in generate_response: {e}", exc_info=True)
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
    except ValueError as ve:  # Catch validation errors (missing fields, bad JSON)
        logger.warning(f"Value Error in /chat request: {ve}")
        def error_stream():
            yield f"event: error\ndata: {json.dumps({'message': str(ve)})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream'), 400  # Bad Request
    except Exception as e:
        # Catch any other unexpected errors during request processing
        logger.error(f"Unexpected error in /chat endpoint before streaming started: {e}", exc_info=True)
        def error_stream():
            yield f"event: error\ndata: {json.dumps({'message': 'An unexpected server error occurred.'})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream'), 500  # Internal Server Error

# --- Main Execution ---
if __name__ == '__main__':
    # For development, debug mode can be enabled here
    # In production, set this to False
    debug_mode = app_config.get('flask_debug', True)
    
    # Use host='0.0.0.0' to make accessible on the network
    host = app_config.get('host', '0.0.0.0')
    port = app_config.get('port', 5000)
    
    logger.info(f"Starting Flask app on {host}:{port} with debug={debug_mode}")
    app.run(host=host, port=port, debug=debug_mode)