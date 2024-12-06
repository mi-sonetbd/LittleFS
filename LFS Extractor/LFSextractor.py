import os
import sys
import subprocess
import tkinter as tk
from tkinter import filedialog, ttk
import threading
import itertools
import time

# Path to mklittlefs.exe, handles bundled PyInstaller path
if getattr(sys, 'frozen', False):  # Running as PyInstaller bundle
    mklittlefs_path = os.path.join(sys._MEIPASS, "mklittlefs.exe")
    icon_path = os.path.join(sys._MEIPASS, "logo.ico")
else:
    mklittlefs_path = "mklittlefs.exe"  # Running as script
    icon_path = "logo.ico"

def browse_file(entry):
    """Open file dialog and set file path to the entry."""
    file_path = filedialog.askopenfilename()
    entry.delete(0, tk.END)
    entry.insert(0, file_path)

def browse_directory(entry):
    """Open directory dialog and set directory path to the entry."""
    dir_path = filedialog.askdirectory()
    entry.delete(0, tk.END)
    entry.insert(0, dir_path)

def update_status(color, text):
    """Update the status display."""
    status_label.config(text=text, fg=color)

def spinner_animation(label, operation_text):
    """Spinner animation to indicate loading."""
    global spinner_message
    for frame in itertools.cycle(["|", "/", "-", "\\"]):
        if not spinner_running:
            break
        label.config(text=f"{operation_text} {frame}", fg="blue")
        time.sleep(0.2)
    label.config(text=spinner_message, fg=spinner_color)

def run_command(command, operation_type, success_message, error_message):
    """Run the given command with spinner animation."""
    global spinner_running, spinner_message, spinner_color
    spinner_running = True
    spinner_thread = threading.Thread(target=spinner_animation, args=(status_label, operation_type))
    spinner_thread.start()

    try:
        # Update the first element of the command list to use the correct mklittlefs.exe path
        command[0] = mklittlefs_path
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            shell=False,
            creationflags=subprocess.CREATE_NO_WINDOW  # Suppress console
        )
        if result.returncode == 0:
            spinner_message = success_message
            spinner_color = "green"
        else:
            spinner_message = f"{error_message}: {result.stderr.strip()}"
            spinner_color = "red"
    except Exception as e:
        spinner_message = f"{error_message}: {str(e)}"
        spinner_color = "red"
    finally:
        spinner_running = False
        spinner_thread.join()

def extract_littlefs():
    """Extract LittleFS image."""
    input_file = extract_input_path.get().strip()
    output_dir = extract_output_path.get().strip()
    block_size = block_size_var.get()
    block_count = block_count_var.get()

    if not os.path.isfile(input_file):
        update_status("red", "Error: Input file does not exist")
        return

    if not os.path.isdir(output_dir):
        os.makedirs(output_dir)

    total_size = block_size * block_count
    command = [
        "mklittlefs.exe",  # Placeholder, will be replaced by mklittlefs_path
        "-u", output_dir,
        "-b", str(block_size),
        "-s", str(total_size),
        input_file,
    ]

    threading.Thread(
        target=run_command,
        args=(
            command,
            "Extracting LittleFS",
            f"Extraction successful to {output_dir}",
            "Error during extraction",
        ),
    ).start()

def create_littlefs():
    """Create LittleFS image."""
    input_dir = create_input_path.get().strip()

    # Always ask for the output file using a save dialog
    output_file = filedialog.asksaveasfilename(
        defaultextension=".bin",
        filetypes=[("Binary Files", "*.bin"), ("All Files", "*.*")],
        title="Save LittleFS Image"
    )
    if not output_file:
        update_status("red", "Error: Output file is not specified")
        return

    # Normalize paths
    input_dir = os.path.normpath(input_dir)
    output_file = os.path.normpath(output_file)

    if not input_dir:
        update_status("red", "Error: Input directory is not specified")
        return

    if not os.path.isdir(input_dir):
        update_status("red", f"Error: The directory '{input_dir}' does not exist")
        return

    block_size = block_size_var.get()
    block_count = block_count_var.get()
    total_size = block_size * block_count

    command = [
        "mklittlefs.exe",  # Placeholder, will be replaced by mklittlefs_path
        "-c", input_dir,
        "-b", str(block_size),
        "-s", str(total_size),
        output_file,
    ]

    threading.Thread(
        target=run_command,
        args=(
            command,
            "Creating LittleFS bin",
            f"Image created successfully: {output_file}",
            "Error during creation",
        ),
    ).start()

# Main application window
root = tk.Tk()
root.title("LittleFS Tool-Kit")
root.geometry("600x600")
root.configure(bg="#f7f7f7")

# Set application icon
try:
    root.iconbitmap(icon_path)
except Exception as e:
    print(f"Warning: Could not set icon: {e}")

# Header
header_frame = tk.Frame(root, bg="#1e90ff", height=60)
header_frame.pack(fill=tk.X)
header_label = tk.Label(header_frame, text="LittleFS Tool-Kit", font=("Segoe UI", 20, "bold"), bg="#1e90ff", fg="white")
header_label.pack(pady=10)

# Extract Section
extract_frame = ttk.LabelFrame(root, text="Extract LittleFS", padding=20)
extract_frame.pack(fill=tk.X, padx=20, pady=10)

ttk.Label(extract_frame, text="Input File (.bin):", width=25).grid(row=0, column=0, sticky="w", pady=5)
extract_input_path = ttk.Entry(extract_frame, width=40)
extract_input_path.grid(row=0, column=1, padx=5)
ttk.Button(extract_frame, text="Browse", command=lambda: browse_file(extract_input_path)).grid(row=0, column=2, padx=5)

ttk.Label(extract_frame, text="Output Directory:", width=25).grid(row=1, column=0, sticky="w", pady=5)
extract_output_path = ttk.Entry(extract_frame, width=40)
extract_output_path.grid(row=1, column=1, padx=5)
ttk.Button(extract_frame, text="Browse", command=lambda: browse_directory(extract_output_path)).grid(row=1, column=2, padx=5)

ttk.Button(extract_frame, text="Extract LittleFS", command=extract_littlefs).grid(row=2, column=1, pady=10)

# Create Section
create_frame = ttk.LabelFrame(root, text="Create LittleFS", padding=20)
create_frame.pack(fill=tk.X, padx=20, pady=10)

ttk.Label(create_frame, text="Input Directory:", width=25).grid(row=0, column=0, sticky="w", pady=5)
create_input_path = ttk.Entry(create_frame, width=40)
create_input_path.grid(row=0, column=1, padx=5)
ttk.Button(create_frame, text="Browse", command=lambda: browse_directory(create_input_path)).grid(row=0, column=2, padx=5)

ttk.Button(create_frame, text="Create LittleFS", command=create_littlefs).grid(row=1, column=1, pady=10)

# Configuration Section
config_frame = ttk.LabelFrame(root, text="Configuration", padding=20)
config_frame.pack(fill=tk.X, padx=20, pady=10)

# Block Size
ttk.Label(config_frame, text="Block Size (bytes):", width=18).grid(row=0, column=0, sticky="w", pady=5)
block_size_var = tk.IntVar(value=4096)
ttk.Entry(config_frame, textvariable=block_size_var, width=18).grid(row=0, column=1, padx=5)

# Block Count
ttk.Label(config_frame, text="Block Count:", width=18).grid(row=0, column=2, sticky="w", pady=5, padx=20)
block_count_var = tk.IntVar(value=1024)
ttk.Entry(config_frame, textvariable=block_count_var, width=18).grid(row=0, column=3, padx=5)

# Status Bar
status_frame = tk.Frame(root, bg="#f7f7f7", height=30)
status_frame.pack(fill=tk.X, side=tk.BOTTOM)
status_label = tk.Label(status_frame, text="Status: Ready", font=("Segoe UI", 10), bg="#f7f7f7", fg="green", anchor="w")
status_label.pack(fill=tk.X, padx=20)

# Footer
footer_label = tk.Label(root, text="© Morshedu Islam Sonet", font=("Segoe UI", 10), bg="#f7f7f7", fg="gray")
footer_label.pack(side=tk.BOTTOM, pady=10)

root.mainloop()
