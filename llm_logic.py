# --- my_chat_app/llm_logic.py ---
import os
import sys
from typing import List, Dict, Generator, Union
from dotenv import load_dotenv
from openai import OpenAI, APIError # Import APIError for better handling
import pandas as pd
import docx
import PyPDF2
import json
import csv
from openpyxl import load_workbook
from zipfile import ZipFile, BadZipFile
import chardet
import logging
import bleach
import yaml
import io # Needed for processing file streams
from werkzeug.datastructures import FileStorage # Flask's file object type

# Set up logging (same as before)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load environment variables (can be done here or in app.py)
load_dotenv(override=True)

# --- Configuration Loading ---
def load_config(config_file="config.yaml"):
    """Loads configuration from a YAML file."""
    try:
        with open(config_file, 'r') as f:
            config_data = yaml.safe_load(f)
            # Basic validation
            if not config_data or 'providers' not in config_data or 'personas' not in config_data:
                raise ValueError("Invalid config structure. Missing 'providers' or 'personas'.")
            return config_data
    except FileNotFoundError:
        logging.error(f"Configuration file not found: {config_file}")
        sys.exit(1) # Exit if config is essential
    except (yaml.YAMLError, ValueError) as e:
        logging.error(f"Error parsing configuration file: {e}")
        sys.exit(1) # Exit if config is essential

# Load config globally or pass it around. Global for simplicity here.
# Consider dependency injection for larger apps.
try:
    config = load_config()
except SystemExit:
    config = None # Handle cases where app might run without exiting (e.g., testing)

# --- Client Configuration ---
def configure_ionos_client(provider_config):
    """Configures the IONOS client."""
    api_key = os.getenv(provider_config['api_key_env'])
    if not api_key:
        raise ValueError("IONOS_API_KEY not found in environment variables.")
    return OpenAI(api_key=api_key, base_url=provider_config['base_url'])

def configure_google_client(provider_config):
    """Configures the Google client."""
    api_key = os.getenv(provider_config['api_key_env'])
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in environment variables.")
    return OpenAI(api_key=api_key, base_url=provider_config['base_url'])

def configure_ollama_client(provider_config):
    """Configures the Ollama client."""
    # Allow overriding base_url via env var for flexibility
    base_url = os.getenv("OLLAMA_BASE_URL", provider_config.get('base_url', 'http://localhost:11434/v1'))
    if not base_url:
         raise ValueError("Ollama base URL not configured in config.yaml or OLLAMA_BASE_URL env var.")
    return OpenAI(base_url=base_url, api_key=provider_config.get('api_key', 'ollama'))

# --- Persona Retrieval ---
def get_persona_message(persona_name: str, config_data: dict) -> str:
    """Retrieves the system message for a given persona."""
    if not config_data or 'personas' not in config_data:
        logging.warning("Config data missing or invalid for personas.")
        return "You are a helpful assistant." # Safe default

    persona_messages = config_data.get('personas', {})
    default_persona = next(iter(persona_messages.keys()), "Default") # Get first persona as default
    fallback_message = persona_messages.get(default_persona, "You are a helpful assistant.")

    return persona_messages.get(persona_name, fallback_message)

# --- File Processing (Adapted for Flask's FileStorage) ---
def detect_encoding(file_data: bytes) -> str:
    """Detect the encoding of the file data."""
    result = chardet.detect(file_data)
    return result['encoding'] if result['encoding'] else 'utf-8'

def sanitize_html(html_content: str) -> str:
    """Sanitizes HTML content to prevent XSS attacks."""
    if not config or 'html_sanitization' not in config:
         logging.warning("HTML sanitization config not found. Skipping sanitization.")
         return html_content # Or apply default strict rules

    settings = config.get('html_sanitization', {})
    allowed_tags = settings.get('allowed_tags', [])
    allowed_attributes = settings.get('allowed_attributes', {})
    return bleach.clean(html_content, tags=allowed_tags, attributes=allowed_attributes, strip=True)

def process_file(file: FileStorage) -> str:
    """Process different file types (from Flask FileStorage) and extract content."""
    if not file or not file.filename:
        return ""

    filename = file.filename
    file_extension = os.path.splitext(filename)[1].lower()
    logging.info(f"Processing file: {filename} (type: {file_extension})")

    content = f"--- Start of File: {filename} ---\n\n"
    file_stream = file.stream # Get the file-like object

    try:
        if file_extension in ['.txt', '.py', '.js', '.html', '.css', '.md', '.sh', '.bat', '.ps1', '.yaml', '.yml', '.xml', '.json']:
            file_bytes = file_stream.read()
            encoding = detect_encoding(file_bytes[:1024]) # Check first KB
            try:
                text_content = file_bytes.decode(encoding)
                if file_extension == '.json':
                    try:
                        parsed_json = json.loads(text_content)
                        formatted_json = json.dumps(parsed_json, indent=2)
                        content += f"File type: JSON\n\n{formatted_json}"
                    except json.JSONDecodeError as json_e:
                        logging.warning(f"Could not parse JSON, treating as text: {json_e}")
                        content += f"File type: {file_extension[1:].upper()} (could not parse as JSON)\n\n{text_content}"
                elif file_extension == '.xml':
                     content += f"File type: XML\n\n{text_content}"
                else:
                     content += f"File type: {file_extension[1:].upper()} file\n\n{text_content}"
            except UnicodeDecodeError as decode_e:
                 logging.error(f"Error decoding file {filename} with detected encoding {encoding}: {decode_e}")
                 content += f"File type: {file_extension[1:].upper()} file\n\nError: Could not decode file content. It might be binary or use an unexpected encoding."

        elif file_extension == '.docx':
            try:
                doc = docx.Document(io.BytesIO(file_stream.read()))
                paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
                tables_content = []
                for table in doc.tables:
                    table_data = []
                    for row in table.rows:
                        row_data = [cell.text for cell in row.cells]
                        table_data.append(" | ".join(row_data))
                    tables_content.append("\n".join(table_data))
                content += "File type: Word Document\n\n"
                content += "PARAGRAPHS:\n" + "\n".join(paragraphs)
                if tables_content:
                    content += "\n\nTABLES:\n" + "\n\n".join(tables_content)
            except Exception as e:
                logging.error(f"Error processing DOCX file {filename}: {str(e)}", exc_info=True)
                content += f"File type: Word Document\n\nError processing content: {str(e)}"

        elif file_extension == '.pdf':
            try:
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_stream.read()))
                pdf_text = '\n\n'.join([page.extract_text() for page in pdf_reader.pages if page.extract_text()])
                content += f"File type: PDF Document\n\n{pdf_text}"
            except Exception as e:
                logging.error(f"Error processing PDF file {filename}: {str(e)}", exc_info=True)
                content += f"File type: PDF Document\n\nError processing content: {str(e)}"

        elif file_extension == '.csv':
            try:
                file_bytes = file_stream.read()
                encoding = detect_encoding(file_bytes[:1024])
                try:
                    csv_content = file_bytes.decode(encoding)
                    # Use io.StringIO to treat the string as a file for csv.reader
                    csv_file_like = io.StringIO(csv_content)
                    csv_reader = csv.reader(csv_file_like)
                    # Sniff dialect just in case
                    try:
                        dialect = csv.Sniffer().sniff(csv_content[:1024])
                        csv_file_like.seek(0) # Reset position after sniffing
                        csv_reader = csv.reader(csv_file_like, dialect)
                    except csv.Error:
                         logging.warning(f"Could not sniff CSV dialect for {filename}, using default.")
                         csv_file_like.seek(0) # Reset position

                    rows = list(csv_reader)
                    # Simple heuristic for header
                    header = ", ".join(rows[0]) if rows else "N/A"
                    num_rows = len(rows) -1 if rows else 0
                    preview = '\n'.join([','.join(row) for row in rows[:10]]) # Preview first 10 rows
                    content += f"File type: CSV\nHeader: {header}\nRows: {num_rows}\n\nPreview:\n{preview}"
                    if len(rows) > 10:
                        content += "\n..."
                except UnicodeDecodeError as decode_e:
                    logging.error(f"Error decoding CSV file {filename} with detected encoding {encoding}: {decode_e}")
                    content += f"File type: CSV\n\nError: Could not decode file content."
            except Exception as e:
                logging.error(f"Error processing CSV file {filename}: {str(e)}", exc_info=True)
                content += f"File type: CSV\n\nError processing content: {str(e)}"

        elif file_extension in ['.xlsx', '.xls']:
            try:
                # Read the entire stream into BytesIO for pandas/openpyxl
                file_bytes = io.BytesIO(file_stream.read())
                # Try reading with pandas first for a quick overview
                try:
                    df = pd.read_excel(file_bytes, sheet_name=None) # Read all sheets
                    content += f"File type: Excel Spreadsheet ({len(df)} sheet(s))\n\n"
                    for sheet_name, sheet_df in df.items():
                        content += f"--- Sheet: {sheet_name} ---\n"
                        content += f"{sheet_df.to_string(index=False, max_rows=10)}\n"
                        if len(sheet_df) > 10:
                            content += "...\n"
                        content += "\n"

                except Exception as pd_e:
                     logging.warning(f"Pandas could not read {filename}, trying openpyxl directly: {pd_e}")
                     # Reset stream position if pandas failed
                     file_bytes.seek(0)
                     try:
                        workbook = load_workbook(file_bytes, read_only=True, data_only=True)
                        content += f"File type: Excel Spreadsheet ({len(workbook.sheetnames)} sheet(s))\n\n"
                        for sheet_name in workbook.sheetnames:
                            content += f"--- Sheet: {sheet_name} ---\n"
                            sheet = workbook[sheet_name]
                            # Extract first few rows as preview
                            rows_preview = []
                            for row_idx, row in enumerate(sheet.iter_rows(max_row=10)):
                                rows_preview.append([str(cell.value) if cell.value is not None else "" for cell in row])
                            content += "\n".join([" | ".join(r) for r in rows_preview])
                            if sheet.max_row > 10:
                                content += "\n..."
                            content += "\n\n"
                     except Exception as oxl_e:
                         logging.error(f"Error processing Excel file {filename} with openpyxl: {str(oxl_e)}", exc_info=True)
                         content += f"File type: Excel Spreadsheet\n\nError processing content: {str(oxl_e)}"

            except Exception as e:
                logging.error(f"Error processing Excel file {filename}: {str(e)}", exc_info=True)
                content += f"File type: Excel Spreadsheet\n\nError processing content: {str(e)}"

        elif file_extension == '.zip':
            try:
                # Read into BytesIO as ZipFile needs a seekable stream
                zip_io = io.BytesIO(file_stream.read())
                with ZipFile(zip_io) as zip_file:
                    file_list = zip_file.namelist()
                    content += f"File type: ZIP Archive\n\nContents ({len(file_list)} files/folders):\n"
                    # Show limited number of files to avoid huge context
                    preview_count = 20
                    content += "\n".join(file_list[:preview_count])
                    if len(file_list) > preview_count:
                        content += f"\n... and {len(file_list) - preview_count} more"
            except BadZipFile:
                 logging.error(f"Error processing ZIP file {filename}: Invalid ZIP file.")
                 content += "File type: ZIP Archive\n\nError: Invalid or corrupted ZIP file."
            except Exception as e:
                logging.error(f"Error processing ZIP file {filename}: {str(e)}", exc_info=True)
                content += f"File type: ZIP Archive\n\nError processing content: {str(e)}"

        else:
            logging.warning(f"Unsupported file type: {filename} ({file_extension})")
            content += f"Unsupported file type: {file_extension}. Cannot process content."

        content += f"\n--- End of File: {filename} ---"
        return content

    except Exception as e:
        logging.error(f"Critical error processing file {filename}: {str(e)}", exc_info=True)
        return f"--- Start of File: {filename} ---\n\nAn critical error occurred during processing: {str(e)}\n\n--- End of File: {filename} ---"

def process_files(files: List[FileStorage]) -> str:
    """Processes a list of Flask FileStorage objects and concatenates their content."""
    all_content = ""
    if not files:
        return ""

    for file in files:
        if file and file.filename: # Check if it's a valid file object
            try:
                file_content = process_file(file)
                if file_content:
                    all_content += file_content + "\n\n"
            except Exception as e:
                 logging.error(f"Failed to process file {file.filename} in list: {e}", exc_info=True)
                 all_content += f"--- Error processing file: {file.filename} ---\n{str(e)}\n\n"
        else:
            logging.warning("Encountered an empty file object in the list.")

    # Simple check for total length (optional, prevents overly huge context)
    max_len = 50000 # Example limit
    if len(all_content) > max_len:
        logging.warning(f"Combined file content length ({len(all_content)}) exceeded limit ({max_len}). Truncating.")
        all_content = all_content[:max_len] + "\n\n[Content Truncated]"

    return all_content.strip()

# --- AI Interaction ---
def select_stream_model(provider: str, model: str, config_data: dict) -> dict:
    """Selects and configures the AI provider client and model."""
    if not config_data or 'providers' not in config_data:
        raise ValueError("Configuration data is missing or invalid.")

    provider_config = config_data.get('providers', {}).get(provider)
    if not provider_config:
        raise ValueError(f"Unknown or missing configuration for provider: {provider}")

    # Validate model against provider's list
    available_models = provider_config.get('models', [])
    if model not in available_models:
        logging.warning(f"Model '{model}' not listed for provider '{provider}'. Using default or first available.")
        model = provider_config.get('default_model', available_models[0] if available_models else None)
        if not model:
             raise ValueError(f"No valid models available for provider: {provider}")

    try:
        if provider == "IONOS":
            client = configure_ionos_client(provider_config)
        elif provider == "GOOGLE":
            client = configure_google_client(provider_config)
        elif provider == "OLLAMA":
            client = configure_ollama_client(provider_config)
        else:
            raise ValueError(f"Provider '{provider}' configuration exists but is not implemented.")
        return {"client": client, "model": model}
    except (ValueError, KeyError, APIError) as e:
        logging.error(f"Failed to configure client for {provider}: {e}", exc_info=True)
        raise ValueError(f"Failed to configure AI client for {provider}: {e}")


def stream_question(
    provider: str,
    model: str,
    persona: str,
    history: List[Dict[str, str]],
    prompt: str,
    files: List[FileStorage], # Use FileStorage type hint
    config_data: dict
) -> Generator[str, None, None]:
    """Processes input and streams the response from the AI model as text chunks."""

    # Ensure config is loaded
    if not config_data:
         yield "Error: Server configuration is missing or invalid. Cannot process request."
         return

    # Basic input validation
    if not prompt.strip():
        yield "Error: Prompt cannot be empty."
        return
    if not provider or not model:
        yield "Error: Provider or model not selected."
        return

    try:
        ai_provider = select_stream_model(provider, model, config_data)
        client = ai_provider["client"]
        model_name = ai_provider["model"]
        logging.info(f"Using model: {model_name} via {provider}")

        system_message = get_persona_message(persona, config_data)

        messages = [{"role": "system", "content": system_message}]

        # Add validated history (ensure role is user/assistant)
        for message in history:
            role = message.get("role")
            content = message.get("content")
            if role in ["user", "assistant"] and isinstance(content, str):
                messages.append({"role": role, "content": content})
            else:
                logging.warning(f"Skipping invalid history item: {message}")


        # Process files (already returns a string)
        files_content = ""
        if files:
            try:
                files_content = process_files(files) # Pass the list of FileStorage objects
                if files_content:
                    files_content = f"\n\n--- Attached Files Context ---\n{files_content}"
            except Exception as e:
                logging.error(f"Error processing files in stream_question: {str(e)}", exc_info=True)
                # Yield error to user instead of just logging?
                yield f"Error processing attached files: {str(e)}\n"
                # Decide if you want to continue without file context or stop
                # files_content = f"\n\n[Error processing files: {str(e)}]" # Option to still send prompt

        user_content = prompt + files_content
        messages.append({"role": "user", "content": user_content})

        logging.debug(f"Sending messages to API: {messages}") # Be careful logging full messages in prod

        stream = client.chat.completions.create(
            model=model_name,
            messages=messages,
            stream=True,
            temperature=0.7, # Example parameter, adjust as needed
            # max_tokens=1000 # Example parameter
        )

        for chunk in stream:
            content = chunk.choices[0].delta.content
            if content is not None:
                yield content # Yield only the new text chunk

    except APIError as e:
        logging.error(f"OpenAI API Error: {e.status_code} - {e.message}", exc_info=True)
        yield f"\n\nError from AI Provider ({provider}): {e.message}"
    except ValueError as e:
         logging.error(f"Configuration or Value Error: {str(e)}", exc_info=True)
         yield f"\n\nConfiguration Error: {str(e)}"
    except ConnectionError as e:
         logging.error(f"Connection Error: {str(e)}", exc_info=True)
         yield f"\n\nConnection Error: Could not reach the AI service ({provider}). Please check the Base URL and network."
    except Exception as e:
        logging.error(f"Unexpected error streaming response: {str(e)}", exc_info=True)
        # Yield a generic error message to the user
        yield f"\n\nAn unexpected error occurred: {str(e)}"