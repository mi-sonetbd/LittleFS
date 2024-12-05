import os
import subprocess
from tkinter import Tk, Label, Entry, Button, filedialog, messagebox, StringVar


def select_image():
    file_path = filedialog.askopenfilename(title="Select LittleFS Image",
                                           filetypes=[("Binary Files", "*.bin"), ("All Files", "*.*")])
    if file_path:
        image_path.set(file_path)

def select_output_dir():
    dir_path = filedialog.askdirectory(title="Select Output Directory")
    if dir_path:
        output_dir.set(dir_path)

def extract_files():
    image = image_path.get()
    output = output_dir.get()
    block_size = block_size_var.get()
    block_count = block_count_var.get()

    if not os.path.exists(image):
        messagebox.showerror("Error", "Invalid image file!")
        return

    if not os.path.exists(output):
        messagebox.showerror("Error", "Invalid output directory!")
        return

    try:
        command = [
            "./mklittlefs",
            "-u", output,
            "-b", str(block_size),
            "-s", str(int(block_size) * int(block_count)),
            image
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0:
            messagebox.showinfo("Success", "Files extracted successfully!")
        else:
            messagebox.showerror("Error", result.stderr)
    except Exception as e:
        messagebox.showerror("Error", str(e))

# GUI Setup
root = Tk()
root.title("LittleFS GUI Extractor")

# Variables
image_path = StringVar()
output_dir = StringVar()
block_size_var = StringVar(value="4096")
block_count_var = StringVar(value="1024")

# Layout
Label(root, text="LittleFS Image:").grid(row=0, column=0, padx=5, pady=5, sticky="e")
Entry(root, textvariable=image_path, width=50).grid(row=0, column=1, padx=5, pady=5)
Button(root, text="Browse", command=select_image).grid(row=0, column=2, padx=5, pady=5)

Label(root, text="Output Directory:").grid(row=1, column=0, padx=5, pady=5, sticky="e")
Entry(root, textvariable=output_dir, width=50).grid(row=1, column=1, padx=5, pady=5)
Button(root, text="Browse", command=select_output_dir).grid(row=1, column=2, padx=5, pady=5)

Label(root, text="Block Size:").grid(row=2, column=0, padx=5, pady=5, sticky="e")
Entry(root, textvariable=block_size_var, width=10).grid(row=2, column=1, padx=5, pady=5, sticky="w")

Label(root, text="Block Count:").grid(row=3, column=0, padx=5, pady=5, sticky="e")
Entry(root, textvariable=block_count_var, width=10).grid(row=3, column=1, padx=5, pady=5, sticky="w")

Button(root, text="Extract Files", command=extract_files).grid(row=4, column=1, pady=10)

root.mainloop()
