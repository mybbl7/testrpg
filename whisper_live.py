#!/usr/bin/env python

from threading import Thread, Lock
from queue import Queue

import numpy as np
import torch
import whisper
import bisect
import sys
import os

from whisper.utils import format_timestamp
from whisper.audio import SAMPLE_RATE, CHUNK_LENGTH, N_FRAMES, HOP_LENGTH
# seconds to bytes in s16le, two on the outside to ensure it's even
s2b = lambda s: int(s * SAMPLE_RATE) * 2
b2s = lambda b: b / SAMPLE_RATE / 2
# bytes to numpy array, from whisper.audio
arr = lambda buf: \
    np.frombuffer(buf, np.int16).flatten().astype(np.float32) / 32768.0

class LiveCaption:
    def __init__(self, audio,
                 live_buffer, live_chunk, live_color, live_context, live_hold, livecap_offset,
                 **args):

        if audio == '-':
            self.fd = 0 #STDIN
        else:
            self.fd = os.open(audio, os.O_RDONLY)

        self.buffer = live_buffer
        self.chunk = live_chunk
        self.buffer_bytes = s2b(self.buffer)
        self.chunk_bytes = s2b(self.chunk)
        self.args = args

        self.livecap_offset = livecap_offset
        self.livecap_text = ''
        self.livecap_lock = Lock()

        self.queue = Queue()
        self.audio = b''

        self.time_offset = 0
        self.segments = []
        self.hold_cnt = 0
        self.hold_thres = live_hold
        self.newseg_begin = None
        self.newseg_end = None

        self.context = live_context
        self.context_tokens = []
        self.context_text = ''
        self.context_pos = None

        self.model = whisper.load_model(
            self.args.pop('model'),
            device=self.args.pop('device'),
            download_root=self.args.pop('model_dir')
        )
        self.tokenizer = whisper.tokenizer.get_tokenizer(self.model.is_multilingual, language=args['language'], task=args['task'])
        print('>> model loaded')

        self.color = live_color
        if self.color:
            self.COLOR_ACTIVE = '\033[94m' # blue
            self.COLOR_UPDATE = '\033[1m\033[94m' # bold blue
            self.COLOR_CONTEXT = '\033[92m' # green
            self.COLOR_END = '\033[0m'
        else:
            self.COLOR_ACTIVE = ''
            self.COLOR_UPDATE = ''
            self.COLOR_CONTEXT = ''
            self.COLOR_END = ''


    def read(self):
        buf = None
        while buf is None or len(buf) > 0:
            buf = os.read(self.fd, self.buffer_bytes)
            self.queue.put(buf)

    def insert_pos(self, search=None, key='start'):
        if search is None:
            search = self.time_offset
        return bisect.bisect_left(self.segments, search, key=lambda s: s[key])

    def update_buffer(self):
        while True:
            audio_buffer = b''
            while len(audio_buffer) < self.buffer_bytes or not self.queue.empty():
                buf = self.queue.get()
                audio_buffer += buf
                if len(buf) == 0:
                    print('>> exit on zero-length read buffer')
                    sys.exit(0)
            self.audio += audio_buffer

            pos = self.insert_pos()

            # [goal] reduce latency
            # priority goes to maintaining audio buffer size
            if len(self.audio) > self.chunk_bytes:
                while len(self.audio) > self.chunk_bytes:
                    # reduce by whole segment size if there's any
                    if pos < len(self.segments) and not self.segments[pos]['open_end']:
                        skip_bytes = s2b(self.segments[pos]['end'] - self.time_offset)
                        pos += 1
                    else:
                        skip_bytes = self.chunk_bytes
                    self.time_offset += b2s(skip_bytes)
                    self.audio = self.audio[skip_bytes:]

            # otherwise, keep a minimal buffer of active segments
            else:
                # more than one active segments, ready to pop
                if pos < len(self.segments) - 1 and not self.segments[pos]['open_end']:
                    self.hold_cnt += 1

                    if self.hold_cnt > self.hold_thres:
                        skip_bytes = s2b(self.segments[pos]['end'] - self.time_offset)
                        self.time_offset = self.segments[pos]['end']
                        self.audio = self.audio[skip_bytes:]

                        self.hold_cnt = 0
                # exactly one, clear hold counter
                elif pos == len(self.segments) - 1:
                    self.hold_cnt = 0

            if len(self.audio) < self.buffer_bytes:
                print('>> buffer too short, update again')
            else:
                return


    def update_transcriptions(self):
        if 'initial_prompt' in self.args:
            # pop to use only once, at the start
            initial_prompt = self.args.pop('initial_prompt')
        else:
            # tokens dont really seem to work; text works well for some lang, for english the script occasionally goes into a '----' loop, causing a temporal surge in latency
            initial_prompt = self.context_text if self.context > 0 else None
        result = self.model.transcribe( arr(self.audio),  initial_prompt=initial_prompt, **self.args )
        new_segs = [
            dict(
                open_end = s['end'] >= self.chunk,
                start = s.pop('start') + self.time_offset,
                end = s.pop('end') + self.time_offset,
                **s
            )
            for s in result['segments']
            if s['avg_logprob'] > self.args['logprob_threshold']
                and s['no_speech_prob'] < self.args['no_speech_threshold']
                and s['start'] < self.chunk
        ]
        if len(new_segs) == 0:
            return

        if self.context > 0:
            self.context_tokens = []
            self.context_text = ''
            pos = self.insert_pos() - 1
            while pos >= 0 and self.segments[pos]['start'] >= self.time_offset - self.context:
                self.context_tokens = self.segments[pos]['tokens'] + [self.tokenizer.timestamp_begin] + self.context_tokens
                self.context_text = self.segments[pos]['text'] + '\n' + self.context_text
                pos -= 1
            self.context_pos = pos + 1

        self.newseg_begin = min(
            self.insert_pos(new_segs[0]['start']),
            self.insert_pos(new_segs[0]['end'], 'end'),
        )
        self.newseg_end = self.insert_pos(new_segs[-1]['end'])
        self.segments = self.segments[:self.newseg_begin] + new_segs + self.segments[self.newseg_end:]


    def write(self):
        os.system('cls' if os.name=='nt' else 'clear')
        pos = self.insert_pos()
        for i, s in enumerate(self.segments):
            text = s['text']
            if self.newseg_begin is not None and self.newseg_end is not None \
                and self.newseg_begin <= i < self.newseg_end:
                text = self.COLOR_UPDATE+ text + self.COLOR_END
            elif pos <= i:
                text = self.COLOR_ACTIVE + text + self.COLOR_END
            elif self.context_pos is not None and self.context_pos <= i:
                text = self.COLOR_CONTEXT + text + self.COLOR_END

            #if s['open_end']:
            #    print(' !!!! ', end="")

            print(f"[{format_timestamp(s['start'])} --> {format_timestamp(s['end'])}] {text}")

    def update_livecap_text(self):
        with self.livecap_lock:
            self.livecap_text = ''
            for s in self.segments:
                if s['start'] >= self.time_offset - self.livecap_offset:
                    self.livecap_text += s['text'] + '\n'

    def get_livecap_text(self):
        with self.livecap_lock:
            return self.livecap_text


    def run(self):
        Thread(target=self.read).start()
        while True:
            self.update_buffer()
            self.update_transcriptions()
            self.update_livecap_text()
            self.write()


if __name__ == '__main__':
    import argparse
    import inspect

    from whisper.transcribe import cli
    from whisper.tokenizer import *
    from whisper.utils import *
    from whisper import *

    parser = argparse.ArgumentParser()
    parser.add_argument("--live_buffer", default=0.05, type=float,
                        help="Read buffer size in seconds for live caption")
    parser.add_argument("--live_chunk", default=CHUNK_LENGTH, type=float,
                        help="Maximum audio chunk length in seconds for live caption")
    parser.add_argument("--live_color", default=True, type=str2bool,
                        help="Enable colored output for active segments in live caption")
    parser.add_argument("--live_context", default=0, type=float,
                        help="Context length in seconds for live caption, 0 to disable")
    parser.add_argument("--live_hold", default=3, type=int,
                        help="Hold a transcription segment this many times before making it final, for live caption")
    parser.add_argument("--livecap_host", default="localhost", type=str, help="livecap web host")
    parser.add_argument("--livecap_port", default=5001, type=int, help="livecap web port")
    parser.add_argument("--livecap_offset", default=7, type=float, help="livecap web port")


    # copied from whisper cli
    parser.add_argument("audio", type=str, help="audio file to transcribe, - for STDIN")
    parser.add_argument("--model", default="small", choices=available_models(), help="name of the Whisper model to use")
    parser.add_argument("--model_dir", type=str, default=None, help="the path to save model files; uses ~/.cache/whisper by default")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu", help="device to use for PyTorch inference")
    #parser.add_argument("--output_dir", "-o", type=str, default=".", help="directory to save the outputs")
    #parser.add_argument("--verbose", type=str2bool, default=True, help="whether to print out the progress and debug messages")

    parser.add_argument("--task", type=str, default="transcribe", choices=["transcribe", "translate"], help="whether to perform X->X speech recognition ('transcribe') or X->English translation ('translate')")
    parser.add_argument("--language", type=str, default=None, choices=sorted(LANGUAGES.keys()) + sorted([k.title() for k in TO_LANGUAGE_CODE.keys()]), help="language spoken in the audio, specify None to perform language detection")

    parser.add_argument("--temperature", type=float, default=0, help="temperature to use for sampling")
    parser.add_argument("--best_of", type=optional_int, default=5, help="number of candidates when sampling with non-zero temperature")
    parser.add_argument("--beam_size", type=optional_int, default=None, help="number of beams in beam search, only applicable when temperature is zero")
    parser.add_argument("--patience", type=float, default=None, help="optional patience value to use in beam decoding, as in https://arxiv.org/abs/2204.05424, the default (1.0) is equivalent to conventional beam search")
    parser.add_argument("--length_penalty", type=float, default=None, help="optional token length penalty coefficient (alpha) as in https://arxiv.org/abs/1609.08144, uses simple length normalization by default")

    parser.add_argument("--suppress_tokens", type=str, default="-1", help="comma-separated list of token ids to suppress during sampling; '-1' will suppress most special characters except common punctuations")
    parser.add_argument("--initial_prompt", type=str, default=None, help="optional text to provide as a prompt for the first window.")
    parser.add_argument("--condition_on_previous_text", type=str2bool, default=True, help="if True, provide the previous output of the model as a prompt for the next window; disabling may make the text inconsistent across windows, but the model becomes less prone to getting stuck in a failure loop")
    parser.add_argument("--fp16", type=str2bool, default=True, help="whether to perform inference in fp16; True by default")

    parser.add_argument("--temperature_increment_on_fallback", type=optional_float, default=None, help="temperature to increase when falling back when the decoding fails to meet either of the thresholds below")
    parser.add_argument("--compression_ratio_threshold", type=optional_float, default=2.4, help="if the gzip compression ratio is higher than this value, treat the decoding as failed")
    parser.add_argument("--logprob_threshold", type=optional_float, default=-1, help="if the average log probability is lower than this value, treat the decoding as failed")
    parser.add_argument("--no_speech_threshold", type=optional_float, default=0.5, help="if the probability of the <|nospeech|> token is higher than this value AND the decoding has failed due to `logprob_threshold`, consider the segment as silence")
    #parser.add_argument("--threads", type=optional_int, default=0, help="number of threads used by torch for CPU inference; supercedes MKL_NUM_THREADS/OMP_NUM_THREADS")
    args = parser.parse_args().__dict__

    temperature = args.pop("temperature")
    temperature_increment_on_fallback = args.pop("temperature_increment_on_fallback")
    if temperature_increment_on_fallback is not None:
        temperature = tuple(np.arange(temperature, 1.0 + 1e-6, temperature_increment_on_fallback))
    else:
        temperature = [temperature]

    webhost = args.pop("livecap_host")
    webport = args.pop("livecap_port")

    lc = LiveCaption(
        temperature=temperature,
        verbose=None,
        **args
    )

    # simple web interface to get latest, active text
    from flask import Flask
    app = Flask('whisper-live')
    @app.route('/livecap_text')
    def livecap_text():
        return lc.get_livecap_text();
    #suppress web logging
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)

    def web():
        app.run(host=webhost, port=webport, debug=False, use_reloader=False)
    Thread(target=web, daemon=True).start()

    lc.run()
