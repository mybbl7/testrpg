#!/usr/bin/env python3
import os
import sys
sys.stdout.reconfigure(line_buffering=True)
import ctypes
import threading
import time
import tkinter as tk
from tkinter.scrolledtext import ScrolledText
from enum import Enum
from soda_proto.soda_api_pb2 import ExtendedSodaConfigMsg, SodaResponse, SodaRecognitionResult
from config import CHANNEL_COUNT, SAMPLE_RATE, CHUNK_SIZE, SODA_PATH
from googletrans import Translator

translator = Translator()


CALLBACK = ctypes.CFUNCTYPE(
    None,
    ctypes.POINTER(ctypes.c_byte),
    ctypes.c_int,
    ctypes.c_void_p
)

class SodaConfig(ctypes.Structure):
    _fields_ = [
        ('soda_config', ctypes.c_char_p),
        ('soda_config_size', ctypes.c_int),
        ('callback', CALLBACK),
        ('callback_handle', ctypes.c_void_p),
    ]

class SodaLanguage(Enum):
    # ENGLISH = "en-US"
    raw_modlang = os.environ.get("MODLANG")
    if raw_modlang:
        try:
            ENGLISH = raw_modlang
        except ValueError:
            sys.stderr.write(
                f"Warning: unsupported MODLANG='{raw_modlang}', using en-US\n"
            )
            ENGLISH = "en-US"
    else:
        ENGLISH = "en-US"
        os.environ["MODLANG"] = "en-US"


class SodaClient:
    def __init__(self, language: SodaLanguage, text_widget: ScrolledText, partial_label: tk.Label):
        self.text = text_widget
        self.partial_label = partial_label

        self.sodalib = ctypes.CDLL(SODA_PATH)
        self._cb = CALLBACK(self._on_soda_response)

        cfg = ExtendedSodaConfigMsg()
        cfg.channel_count           = CHANNEL_COUNT
        cfg.sample_rate             = SAMPLE_RATE
        cfg.api_key                 = 'ce04d119-129f-404e-b4fe-6b913fffb6cb'
        cfg.recognition_mode        = ExtendedSodaConfigMsg.CAPTION
        cfg.language_pack_directory = f'./models/{language.value}/SODAModels/'
        blob = cfg.SerializeToString()
        self.config = SodaConfig(blob, len(blob), self._cb, None)

        self.sodalib.CreateExtendedSodaAsync.restype = ctypes.c_void_p

    def _on_soda_response(self, data_ptr, length, user_data):
        buf = ctypes.string_at(data_ptr, length)
        res = SodaResponse()
        res.ParseFromString(buf)

        if res.soda_type != SodaResponse.SodaMessageType.RECOGNITION:
            return

        rr = res.recognition_result
        if rr.result_type == SodaRecognitionResult.ResultType.PARTIAL:
            txt = rr.hypothesis[0]
            self.partial_label.after(0, self._show_partial, txt)

        elif rr.result_type == SodaRecognitionResult.ResultType.FINAL:
            checklng = os.getenv("MODLANG")
            disabletrenv = os.getenv("DISABLETR")  # read the env variable
            txt = rr.hypothesis[0]
            print(txt)
            if checklng != "en-US":
                if not disabletrenv:
                    target_lang = 'en'
                    try:
                        trans = translator.translate(txt, dest=target_lang)
                        translated = trans.text
                        print(translated)

                    except Exception as e:
                        translated = f"Translation error: {e}"
            self.text.after(0, self._show_final, txt)
            # self.text.after(0, self._show_final, txt)
    # example: update another label with translated text
            if checklng != "en-US":
                if not disabletrenv:
                    self.text.after(0, self._show_final, translated)
            self.partial_label.after(0, self._clear_partial)

    def _show_partial(self, txt: str):
        self.partial_label.config(text=f"* partial: {txt}")

    def _clear_partial(self):
        self.partial_label.config(text="")

    def _show_final(self, txt: str):
        self.text.insert(tk.END, f"- {txt}\n")
        self.text.see(tk.END)

    def start_stream(self, audio_stream):
        self.handle = ctypes.c_void_p(self.sodalib.CreateExtendedSodaAsync(self.config))
        self.sodalib.ExtendedSodaStart(self.handle)
        while True:
            chunk = audio_stream.read(CHUNK_SIZE)
            if not chunk:
                break
            self.sodalib.ExtendedAddAudio(self.handle, chunk, len(chunk))
            time.sleep(0.005)

    def shutdown(self):
        self.sodalib.DeleteExtendedSodaAsync(self.handle)


def main():
    # Silence native stderr
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, 2)
    os.close(devnull)

    stream = sys.stdin.buffer
    lang = SodaLanguage.ENGLISH


    model_dir = f'./models/{lang.value}/SODAModels/'
    if not os.path.isdir(model_dir):
        sys.stderr.write(f"Error: missing models in {model_dir}\n")
        sys.exit(1)
    if not os.path.isfile(SODA_PATH):
        sys.stderr.write(f"Error: SODA binary not found at {SODA_PATH}\n")
        sys.exit(1)

    root = tk.Tk()
    root.title("SODA Transcription")

    # fixed window size
    root.geometry("800x600")
    root.resizable(False, False)

    # Partial area container fixed to ~10 lines (wraps at 780px)
    partial_frame = tk.Frame(root, height=500)
    partial_frame.pack(fill=tk.X)
    partial_frame.pack_propagate(False)

    partial_font = ("Helvetica", 20, "bold")
    partial_lbl = tk.Label(
        partial_frame,
        text="",
        fg="green",
        anchor="nw",
        justify="left",
        font=partial_font,
        wraplength=780,
        padx=10,
        pady=10
    )
    partial_lbl.pack(fill=tk.BOTH, expand=True)

    # Scroll area for final results
    txt = ScrolledText(root, wrap=tk.WORD)
    txt.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    client = SodaClient(language=lang, text_widget=txt, partial_label=partial_lbl)

    def runner():
        client.start_stream(stream)
        client.shutdown()

    threading.Thread(target=runner, daemon=True).start()
    root.mainloop()


if __name__ == "__main__":
    main()
