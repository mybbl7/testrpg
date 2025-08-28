

/*
MIT License

Copyright (c) 2025 fenris666 on f95zone.to

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


  The Rule of First Adopters

  Intended to make RpgMaker MV and MZ games working in Linux and Android
  Secondary target: make it hard for malware to run harmful code

  Install:
    Copy this script to www/js/bootstrap.js
    Add the following line to package.json
    "inject_js_start": "www/js/bootstrap.js",

  Sources:
    https://tvtropes.org/pmwiki/pmwiki.php/Main/TheRuleOfFirstAdopters
    https://docs.nwjs.io/en/latest/References/Manifest%20Format/#inject_js_start
      inject_js_start
    https://github.com/bakustarver/rpgmakermlinux-cicpoffs
      addiional improvement ideas

  Version: rev1-alpha
    rushed public version
    untested on windows :(
    untested on android (unsure how this approach fucks up joiplay and similar emulators) - if it works then cool, if it does not then expect me removing android specific code.
    untested on mac (no personal interest in mac support and RPGMaker natively supports IOS)
    expect games to break because of my overzealous security rules allowing only a few nodejs modules.
    the case sensitive compability layer seems to work reliable but there will likely be games loading resources in new and unexpeced ways
    the security hardening against malware is basic and overzealous and will likely break games
    the security hardening against malware still has known holes but so far I expect the enemy not to tailor their attacks against this script yet
    this script does not help if Game.exe is infected! It will be up to the distributor to checkt/replace Game.exe with one from trusted sources!
      explanation: I use linux and therefor the windows binaries are almost worthless to me. My other private script determines which nwjs version is used and downloads that for linux which bypasses Game.exe and DLL-files in the main dir.
    similar case wih infected dll files (in the future I plan to only allow loading whitelisted dlls)

  Planned features:
    sanitize/neuter further functions like eval(), new Function. Anything to read/write files outside game dir and save game files. Anything related to loading files from internet except a few whitelisted files (which should have been part of the local game files anyway) or some whitelisted endpoints to reputable websites (steam, gog, dlsite etc)
  Intended audience:
    linux gamers (original target of this project)
    testers curious to test this boostrap script against new games or questionable games

*/

(function() {
  try {
    const isLinux = process.platform === 'linux';
    const isAndroid = process.platform === 'android' ||
      (isLinux && require('os').release().toLowerCase().includes('android'));

    let enableLoggingToStdout = false;
    let enableLoggingToFile = false;
    // TODO issue regarding some japanese Kanji not properly encoded or decoded when creaing the xhr request. Fails o find file.
    // Not yet implemented and I try to find my scripts which solved that issue in the past
    let fixBadJapaneseNames = false;
    let fixCaseSensitive = true;

    if (isAndroid) {
      console.log('[RpgMaker4Linux] Android detected – applying monkey patches');
      fixBadJapaneseNames = true;
      fixCaseSensitive = true;
    }
    else if (isLinux) {
      console.log('[RpgMaker4Linux] Linux detected – applying monkey patches');
      enableLoggingToStdout = true;
      enableLoggingToFile = true;
      fixBadJapaneseNames = true;
      fixCaseSensitive = true;
    }
    else {
      console.log('[RpgMaker4Linux] Windows assumed – applying monkey patches');
      enableLoggingToStdout = true;
      enableLoggingToFile = true;
      fixBadJapaneseNames = false;
      //required to enable securiy fixes
      fixCaseSensitive = true;
    }

    const originalPath = require('path');
    const originalFs = require('fs');

    if (enableLoggingToStdout || enableLoggingToFile) {
      // Logging setup
      let logStream; // Declare outside of conditional block
      if (enableLoggingToFile) {
        const logFilePath = originalPath.join(process.cwd(), 'game-log.txt');
        logStream = originalFs.createWriteStream(logFilePath, {
          flags: 'w'
        });
      }

      function getTimestamp() {
        return new Date().toISOString();
      }

      function formatMessage(type, args) {
        return `[${getTimestamp()}] [${type.toUpperCase()}] ${args.join(' ')}\n`;
      }

      ['log', 'warn', 'error', 'info', 'debug'].forEach(type => {
        if (typeof console[type] === 'function') {
          const originalConsole = console[type];
          originalConsole('Wrapping console ' + type);
          console[type] = function(...args) {
            try {
              const message = formatMessage(type, args.map(String));
              if (enableLoggingToFile && logStream) logStream.write(message);
              if (enableLoggingToStdout) process.stdout.write(message);
              originalConsole.apply(console, args);
            }
            catch (e) {
              console.error(e);
            }
          };
        }
      });

      process.on('exit', () => {
        if (logStream) logStream.end();
      });
    }

    if (fixCaseSensitive) {
      const Module = require('module');
      const originalRequire = Module.prototype.require;

      let gameRoot = process.cwd();

      // Cache for case-insensitive path resolution
      const pathCache = new Map();
      pathCache.set("", "");

      // Returns a corrected path
      function toCaseInsensitivePath(origPath, cwd = null, isUri = false) {
        if (origPath.startsWith('data:image')) return origPath;
//console.log(`origPath: ${origPath}, cwd: ${cwd}, isUri: ${isUri}`);
//if (origPath.endsWith('bar_3.png')) { console.log(origPath); }
//if (origPath.endsWith('bar_3.png')) { console.log('1'); }
        if (pathCache.has(origPath)) {
//if (origPath.endsWith('bar_3.png')) { console.log('2'); }
          return pathCache.get(origPath);
        }
        else {
//if (origPath.endsWith('bar_3.png')) { console.log('3'); }
          const actualPath = findCaseInsensitivePath(origPath, cwd, isUri);
//if (origPath.endsWith('bar_3.png')) { console.log('4'); }
          if (actualPath) {
            if (actualPath !== origPath) {
              console.warn('[RpgMaker4Linux] Path fix:', origPath, '->', actualPath);
            }
            pathCache.set(origPath, actualPath);
//if (origPath.endsWith('bar_3.png')) { console.log(''); }
            return actualPath;
          }
          else {
//if (origPath.endsWith('bar_3.png')) { console.log('6'); }
            return origPath;
          }
        }
      }

      const regex = /\.(rpgsave|rmmzsave_?)$/i;

      function findCaseInsensitivePath(origPath, cwd = null, isUri = false) {
        try {
          let fullPath = origPath;
          if (isUri) fullPath = decodeURIComponent(fullPath);
          if (cwd) fullPath = originalPath.join(process.cwd, cwd, fullPath);

          if (originalFs.existsSync(fullPath)) {
            return origPath;
          }

          let dir = originalPath.dirname(fullPath);
          const base = originalPath.basename(fullPath).toLowerCase();

          if (dir && dir !== '.' && dir !== '/' && !originalFs.existsSync(dir)) {
            const dirInsensitive = toCaseInsensitivePath(dir, cwd, false);
            if (!originalFs.existsSync(dirInsensitive)) {
              console.error('[RpgMaker4Linux] Directory not found:', dir);
              return null;
            }
            dir = dirInsensitive;
            fullPath = originalPath.join(dirInsensitive, base);
            if (originalFs.existsSync(fullPath)) {
              let relativeResolved = originalPath.relative(cwd || gameRoot, fullPath);
              console.warn('[RpgMaker4Linux] Directory path fix:', origPath, '->', relativeResolved);
              if (isUri) relativeResolved = relativeResolved.split('/').map(encodeURIComponent).join('/');
              return relativeResolved;
            }
          }

          const files = originalFs.readdirSync(dir);
          const match = files.find(f => f.toLowerCase() === base);
          if (match) {
            const resolved = originalPath.join(dir, match);
            let relativeResolved = originalPath.relative(cwd || gameRoot, resolved);
            console.warn('[RpgMaker4Linux] File path fix:', origPath, '->', relativeResolved);
            if (isUri) relativeResolved = relativeResolved.split('/').map(encodeURIComponent).join('/');
            return relativeResolved;
          } else if (regex.test(origPath)) {
            // do no report non-existing save games
            return null;
          }
//          if (origPath.endsWith('_')) {
//            return findCaseInsensitivePath(origPath.slice(0, -1));
//          }

          console.warn('[RpgMaker4Linux] No case-insensitive match found:', origPath);
          return null;
        }
        catch (e) {
          console.error('[RpgMaker4Linux] Error resolving path:', origPath, e);
          return null;
        }
      }

      const subdir = originalFs.existsSync(originalPath.join(process.cwd(), 'www')) ? 'www' : null;
      const handleUrl = function(url) {
        if (typeof url !== 'string') url = String(url);

        let parts = url.split('://');
        let prefix = parts[0]; // Define prefix once outside conditions

        if (parts.length === 1) {
          url = toCaseInsensitivePath(url, subdir, true);
        }
        else {
          const rest = parts[1];

          if (prefix === 'chrome-extension') {
            let [host, ...pathParts] = rest.split('/');
            let basePath = pathParts.join('/');
            let [path, query] = basePath.split('?');
            path = toCaseInsensitivePath(path, subdir, true);
            url = `${prefix}://${host}/${path}${query ? '?' + query : ''}`;
          }
          else if (prefix === 'file') {
            let [path, query] = rest.split('?');
            path = toCaseInsensitivePath(path, subdir, true);
            url = `${prefix}://${path}${query ? '?' + query : ''}`;
          }
        }
        return url;
      }

      // Monkey patch require for fs
      const patchedFs = new Proxy(originalFs, {
        get(target, prop) {
          if (['readFileSync', 'existsSync', 'statSync', 'readFile'].includes(prop)) {
            return function(...args) {
              if (typeof args[0] === 'string') {
                args[0] = toCaseInsensitivePath(args[0]);
              }
              return target[prop](...args);
            };
          }
          return target[prop];
        }
      });

      const originalLoad = Module._load;
      function loadPatchedModule(request) {
        if (request === 'fs') return patchedFs;
        if (request === 'path') return originalPath;
        if (request === 'module') return Module;

        // Block dangerous modules
        // These modules are basically expected to exclusivly used by malware code
        if (['http', 'https', 'child_process', 'vm'].includes(request)) {
          const e = new Error(`[SECURITY] Access to '${request}' is denied. Possible malicious intent.`);
          console.warn(e);
          throw e;
        }

        // Allow modules expected to be used by rpgmaker games
        // This whitelist approach will likely cause lots of false negatives
        if (!['fs', 'path', 'os', 'url', 'module', 'util', 'zlib', 'stream', 'events', 'querystring', 'buffer'].includes(request)) {
          const e = new Error(`[SECURITY] Access to '${request}' is denied. Unknown intend. Could be good or bad.`);
          console.warn(e);
          throw e;
        }
        return null;
      }

      // Security: monkey patch Module._load o avoid access to original unpatched modules
      Module._load = function(request, parent, isMain) {
        const patchedModule = loadPatchedModule(request);
        return patchedModule ? patchedModule : originalLoad.apply(this, arguments);
      };

      // Security: remove unpatched instances from module cache
      delete require.cache[require.resolve('fs')];
      delete require.cache[require.resolve('path')];

      // Security: monkey patch require to avoid access to original unpatched modules
      Module.prototype.require = function(request) {
        const patchedModule = loadPatchedModule(request);
        return patchedModule ? patchedModule : originalRequire.apply(this, arguments);
      };

      // Security: monkey patch global require to avoid access to original unpatched modules
      global.require = function(request) {
        return Module._load(request, module);
      };

      // Patch XMLHttpRequest.open() to normalize file paths
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        //console.log('[Patch] XHR requested:', url);
        url = handleUrl(url);
        return originalOpen.call(this, method, url, ...args);
      };

      // Patch widow.fetch() to normalize file paths
      const originalFetch = window.fetch;
      window.fetch = function(url, init) {
        //console.log('[Patch] fetch requested:', url);
        url = handleUrl(url);
        return originalFetch(url, init);
      };

      const originalFontFaceConstructor = FontFace;
      FontFace = function(family, source) {
          // Extract the URL inside url("...")
          const urlMatch = source.match(/^url\(["']?(.*)["']?\)$/);
          if (urlMatch) {
              let url = urlMatch[1]; // This gives you the URL between the quotes or parentheses
              url = handleUrl(url); // Modify the URL using your function
              return new originalFontFaceConstructor(family, `url(${url})`); // Create the FontFace with the modified URL
          } else {
              // If no URL found, fall back to the original constructor (just in case)
              return new originalFontFaceConstructor(family, source);
          }
      };

      // Patch setAttribute for img/audio/etc.
      const originalSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(attr, value) {
        if ((this instanceof HTMLImageElement || this instanceof HTMLAudioElement || this instanceof HTMLVideoElement) &&
          attr.toLowerCase() === 'src') {
          //console.log('[Patch] '+this.instance+' requested:', value);
          value = handleUrl(value);
        }
        return originalSetAttribute.call(this, attr, value);
      };

      // Patch src property directly
      function patchSrcProperty(proto) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'src');
        if (descriptor && descriptor.set) {
          Object.defineProperty(proto, 'src', {
            ...descriptor,
            set: function(value) {
              value = handleUrl(value);
              return descriptor.set.call(this, value);
            }
          });
        }
      }

      patchSrcProperty(HTMLImageElement.prototype);
      patchSrcProperty(HTMLAudioElement.prototype);
      patchSrcProperty(HTMLVideoElement.prototype);




      // Helpful context output
      console.log('gameRoot:', gameRoot);
    }

  } catch (e) {
    console.error(e);
    if (process && process.stdout) process.stdout.write(e);
  }



})();

