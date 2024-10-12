'use strict';

(() => {
  class TaskQueue {
    constructor() {
      this.queue = [];
      this.activeTask = undefined;
    }

    add(name, action) {
      return new Promise((resolve, reject) => {
        const task = {
          name,
          action,
          resolve,
          reject
        };

        if (this.activeTask === undefined) {
          this.startTask(task);
        } else {
          this.queue.push(task);
        }
      });
    }

    startTask(task) {
      if (this.activeTask !== undefined) {
        throw new Error('Busy');
      }

      console.log(`Starting task: ${task.name}`);
      this.activeTask = task;

      let promise;
      try {
        promise = task.action();
      } catch (err) {
        this.onTaskEnd();
        task.reject(err);
        return;
      }

      promise.then((value) => {
        this.onTaskEnd();
        task.resolve(value);
      }, (err) => {
        this.onTaskEnd();
        task.reject(err);
      });
    }

    onTaskEnd() {
      if (this.activeTask === undefined) {
        throw new Error('Idle');
      }

      console.log(`Task ended: ${this.activeTask.name}`);
      this.activeTask = undefined;

      if (this.queue.length !== 0) {
        this.startTask(this.queue.shift());
      }
    }
  }

  function icon(name) {
    const elem = $.inner($('span', ['mr-2']), appResources.icons[name]);
    elem.firstChild.classList.add('w-5', 'h-5', 'inline');
    return elem;
  }

  function createFileReader(file, blockSize, nBlocks, maxCachedBlocks) {
    const fileSize = file.size;

    const cacheQueue = [];
    const cachedBlocks = [];

    function retrieveCachedBlock(blockIndex) {
      return cachedBlocks[blockIndex];
    }

    function storeBlockInCache(blockIndex, data) {
      cachedBlocks[blockIndex] = data;
      if (!cacheQueue.includes(blockIndex)) {
        console.log(`Adding block ${blockIndex} to cache`);
        cacheQueue.push(blockIndex);
        if (cacheQueue.length > maxCachedBlocks) {
          const deleteBlock = cacheQueue.shift();
          console.log(`Evicting block ${deleteBlock} from cache`);
          delete cachedBlocks[deleteBlock];
        }
      }
    }

    return (offset, buffer, ptr, size) => {
      if (offset + size > blockSize * nBlocks) {
        throw new Error('Access out of bounds');
      }

      const blockIndex = Math.floor(offset / blockSize);
      if (blockIndex !== Math.floor((offset + size - 1) / blockSize)) {
        throw new Error('Access across blocks');
      }

      const availableBytes = (offset < fileSize) ? Math.min(size, fileSize - offset) : 0;
      if (availableBytes < size) {
        new Uint8Array(buffer, ptr + availableBytes, size - availableBytes).fill(0);
      }

      if (availableBytes === 0) {
        return;
      }

      const blockStartOffset = blockIndex * blockSize;
      const offsetInBlock = offset - blockStartOffset;

      const cachedBlock = retrieveCachedBlock(blockIndex);
      if (cachedBlock !== undefined) {
        new Uint8Array(buffer).set(new Uint8Array(cachedBlock, offsetInBlock, availableBytes), ptr);
        return;
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const slice = file.slice(blockStartOffset, Math.min(blockStartOffset + blockSize, fileSize));
        reader.onload = () => {
          storeBlockInCache(blockIndex, reader.result);
          new Uint8Array(buffer).set(new Uint8Array(reader.result, offsetInBlock, availableBytes), ptr);
          resolve();
        };
        reader.onerror = (err) => {
          reject(err);
        };
        reader.readAsArrayBuffer(slice);
      });
    };
  }

  function buildBlockOverview(reader, tasks, nBlocks, nPerRow) {
    const fsBlocksElement = $('div', ['my-4']);
    const title = fsBlocksElement.appendChild($('h2', ['text-lg']));

    tasks.add('Listing used file system blocks', async () => {
      const usedBlocks = new Set();
      await reader.traverse((block) => usedBlocks.add(block));

      title.textContent = `${usedBlocks.size} of ${nBlocks} blocks are in use (${(100 * usedBlocks.size / nBlocks).toFixed(1)}%)`;

      const svg = fsBlocksElement.appendChild($.svg('svg', {
        width: '100%',
        viewBox: `0 0 ${nPerRow} ${Math.ceil(nBlocks / nPerRow)}`
      }));

      for (let i = 0; i < nBlocks; i++) {
        svg.appendChild($.into(
          $.svg('rect', {
            x: i % nPerRow + 0.125,
            y: Math.floor(i / nPerRow) + 0.125,
            width: .75,
            height: .75,
            fill: usedBlocks.has(i) ? 'forestgreen' : 'snow',
            stroke: 'black',
            'stroke-width': .025
          }),
          [
            $.text($.svg('title'), `Block ${i} is ${usedBlocks.has(i) ? 'in use' : 'unused'}`)
          ]
        ));
      }
    });

    return fsBlocksElement;
  }

  function createAndShowDialog(title, body, buttons) {
    const backdrop = $('div', ['fixed', 'top-0', 'right-0', 'bottom-0', 'left-0', 'z-40', 'bg-gray-800', 'bg-opacity-70']);
    document.body.appendChild(backdrop);
    const dialogContainer = $('div', ['z-50', 'absolute', 'top-0', 'right-0', 'bottom-0', 'left-0', 'mt-16', 'pointer-events-none']);
    const dialog = $('div', ['max-w-screen-md', 'mx-auto', 'bg-white', 'p-4', 'border', 'rounded-lg', 'shadow-lg', 'pointer-events-auto']);
    dialog.appendChild($.text($('h3', ['text-xl', 'pb-4']), title));
    dialog.appendChild($('hr'));
    dialog.appendChild(body);
    if (buttons) {
      dialog.appendChild($('hr'));
      dialog.appendChild(buttons);
    }
    dialogContainer.appendChild(dialog);
    document.body.appendChild(dialogContainer);

    function close() {
      document.body.removeChild(backdrop);
      document.body.removeChild(dialogContainer);
    }

    backdrop.addEventListener('click', close);

    return { backdrop, dialog, close };
  }

  function convertBinaryToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return byteArray.reduce((output, byte) => output + byte.toString(16).padStart(2, '0') + ' ', '');
  }

  function convertBinaryToRaw(buffer) {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    try {
      return decoder.decode(buffer); // Attempt to decode as text
    } catch (e) {
      return convertBinaryToBase64(buffer); // Fallback to Base64 if not decodable as text
    }
  }

  function convertBinaryToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);  // Base64 encoded string
  }

function decodeLogData(hexData) {
  // Split the hex string into an array of byte values
  const byteArray = hexData.trim().split(' ').map(b => parseInt(b, 16));

  // Convert the byte array to a Uint8Array and then to an ArrayBuffer
  const logBuffer = new Uint8Array(byteArray).buffer;

  // Now, logBuffer is an ArrayBuffer and can be passed to DataView
  const dataView = new DataView(logBuffer);

  // Parse date and time fields (uint8)
  const year = dataView.getUint8(0); // Year
  const month = dataView.getUint8(1); // Month
  const date = dataView.getUint8(2); // Date
  const hours = dataView.getUint8(3); // Hours
  const minutes = dataView.getUint8(4); // Minutes
  const seconds = dataView.getUint8(5); // Seconds

  // Parse floats (little-endian)
  const lat = dataView.getFloat32(6, true);   // Latitude (LE)
  const lng = dataView.getFloat32(10, true);  // Longitude (LE)
  const speed = dataView.getFloat32(14, true); // Speed (LE)
  const course = dataView.getFloat32(18, true); // Course (LE)

  // Parse additional uint8 fields
  const sat = dataView.getUint8(22); // Satellites
  const bat = dataView.getUint8(23); // Battery
  const sos = dataView.getUint8(24); // SOS flag
  const crg = dataView.getUint8(25); // Charger flag

  console.log("Parsed Data: ", { year, month, date, hours, minutes, seconds, lat, lng, speed, course, sat, bat, sos, crg });

  return {
    year,
    month,
    date,
    hours,
    minutes,
    seconds,
    lat,
    lng,
    speed,
    course,
    sat,
    bat,
    sos,
    crg
  };
}


function displayDecodedData(logData) {
  const decodedDataDiv = document.createElement('div');
  decodedDataDiv.className = 'my-4';

  decodedDataDiv.innerHTML = `
    <div class="tracking-widest uppercase text-xs">Decoded Log Data</div>
    <pre class="whitespace-pre-wrap">
      Date: ${logData.date}/${logData.month}/20${logData.year}
      Time: ${logData.hours}:${logData.minutes}:${logData.seconds}
      Latitude: ${logData.lat.toFixed(6)}
      Longitude: ${logData.lng.toFixed(6)}
      Speed: ${logData.speed.toFixed(2)} km/h
      Course: ${logData.course.toFixed(2)} degrees
      Satellites: ${logData.sat}
      Battery: ${logData.bat}%
      SOS: ${logData.sos ? 'Yes' : 'No'}
      Charger Connected: ${logData.crg ? 'Yes' : 'No'}
    </pre>
  `;
  return decodedDataDiv;
}

  function createDirectoryBrowser(reader, tasks) {
    async function listDir(dir) {
      await reader.openDir(dir);
      const entries = [];
      let entry;
      try {
        while ((entry = await reader.readDir()) !== null) {
          entries.push(entry);
        }
        await reader.closeDir();
      } catch (err) {
        err.partialResult = entries;
        throw err;
      }
      return entries;
    }

    const browserElement = $('div', ['my-4']);
    const title = browserElement.appendChild($('h2', ['text-lg']));
    const listContainer = browserElement.appendChild($('div'));

    function showDirectoryContents(dirComponents) {
      const dir = dirComponents.join('/');
      tasks.add(`Listing contents of ${dir}`, () => listDir(dir)).then((entries) => {
        if (dir === '') {
          title.textContent = 'Contents';
        } else {
          title.textContent = 'Contents of ';
          for (let i = 0; i < dirComponents.length; i++) {
            if (i !== 0) title.appendChild(document.createTextNode('/'));
            $.into(
              title.appendChild($('a', ['hover:underline'], { href: '#' })),
              [$.text($('code', ['px-1']), dirComponents[i])]
            ).addEventListener('click', (event) => {
              event.preventDefault();
              showDirectoryContents(dirComponents.slice(0, i + 1));
            });
          }
        }

        listContainer.innerHTML = '';
        let lastElement;
        for (const entry of entries) {
          const { type, size, name } = entry;
          const entryPath = (dir === '') ? name : `${dir}/${name}`;
          const sizeText = (size < 1024) ? `${size} B` : (size < 1024 * 1024) ? `${(size / 1024).toFixed(1)} KiB` : `${(size / (1024 * 1024)).toFixed(1)} MiB`;
          const child = listContainer.appendChild($('a', ['block', 'grid', 'grid-cols-6', 'border', 'p-2'], {
            href: '#',
            title: entryPath
          }));
          if (lastElement === undefined) {
            child.classList.add('rounded-t-lg');
          }
          const isDirectory = (type === 2);
          child.appendChild(
            $.into($('span', ['col-span-4']), [
              icon(isDirectory ? 'outline/folder' : 'solid/document'),
              $.text($('span', ['font-semibold']), name)
            ])
          );
          if (isDirectory) {
            const textNode = document.createTextNode('Pending');
            child.appendChild($.into(
              $('span'),
              [
                icon('outline/folder-open'),
                textNode
              ]
            ));
            tasks.add(`Listing contents of ${entryPath}`, async () => {
              textNode.textContent = 'Loading';
              const entries = await listDir(entryPath);
              const n = entries.length - ['.', '..'].length;
              textNode.textContent = `${n} entr${n === 1 ? 'y' : 'ies'}`;
            });
          } else {
            child.appendChild($.into(
              $('span'),
              [
                icon('outline/circle-stack'),
                sizeText
              ]
            ));
          }
          {
            const textNode = document.createTextNode('Pending');
            const attrElem = child.appendChild($.into(
              $('span', ['text-gray-400']),
              [
                icon('outline/tag'),
                textNode
              ]
            ));
            tasks.add(`Listing attributes of ${entryPath}`, async () => {
              textNode.textContent = 'Loading';
              const nAttr = await reader.countAttributes(entryPath);
              textNode.textContent = `${nAttr} attribute${nAttr === 1 ? '' : 's'}`;
              if (nAttr !== 0) {
                attrElem.classList.remove('text-gray-400');
              }
            });
          }

          child.addEventListener('click', (event) => {
            event.preventDefault();
            if (isDirectory) {
              let newDir;
              if (name === '.') {
                const realName = dirComponents[dirComponents.length - 1] || 'File system root';
                createAndShowDialog(`Directory: ${realName}`, $('div'));
                return;
              } else if (name === '..') {
                newDir = dirComponents.slice(0, -1);
              } else {
                newDir = [...dirComponents, name];
              }
              showDirectoryContents(newDir);
            } else {
              const dialogBody = $('div', ['flex', 'flex-col', 'space-y-4']);
              const infoBox = dialogBody.appendChild($.into($('div', ['w-full']), [
                $.into($('div', ['my-4']), [
                  $.text($('div', ['tracking-widest', 'uppercase', 'text-xs']), 'Directory'),
                  $.text($('div'), dir === '' ? 'None (file system root)' : dir)
                ]),
                $.into($('div', ['my-4']), [
                  $.text($('div', ['tracking-widest', 'uppercase', 'text-xs']), 'Size'),
                  $.text($('div'), `${sizeText} (${size.toLocaleString('en-US')} bytes)`)
                ])
              ]));

              // Read the raw binary data and its hex representation
              tasks.add(`Opening ${name}`, async () => {
                await reader.openFile(entryPath);
                const binaryData = await reader.readFile();  // This is your binary buffer
                await reader.closeFile();

                // Convert binary to hex
                const hexView = convertBinaryToHex(binaryData);

                // Convert binary to raw (either text or base64)
                const rawView = convertBinaryToRaw(binaryData);

                // Decode the log data
                const logData = decodeLogData(hexView);

                // Display Raw Data
                const rawDataDiv = document.createElement('div');
                rawDataDiv.className = 'my-4';
                rawDataDiv.innerHTML = `
                  <div class="tracking-widest uppercase text-xs">Raw Data (Text or Base64)</div>
                  <pre class="whitespace-pre-wrap">${rawView}</pre>
                `;
                infoBox.appendChild(rawDataDiv);

                // Display Hexadecimal Data
                const hexDataDiv = document.createElement('div');
                hexDataDiv.className = 'my-4';
                hexDataDiv.innerHTML = `
                  <div class="tracking-widest uppercase text-xs">Hexadecimal Data</div>
                  <pre class="whitespace-pre-wrap">${hexView}</pre>
                `;
                infoBox.appendChild(hexDataDiv);

                // Display Decoded Log Data
                const decodedDataDiv = displayDecodedData(logData);
                infoBox.appendChild(decodedDataDiv);
              });

              const buttons = document.createElement('div');
              buttons.className = 'mt-4';
              const downloadButton = document.createElement('button');
              downloadButton.className = 'border p-2 shadow';
              downloadButton.type = 'button';
              downloadButton.textContent = 'Save';

              const downloadButtonSvg = icon('outline/arrow-down-tray');
              downloadButton.prepend(downloadButtonSvg);

              // Existing logic for downloading the file
              downloadButton.addEventListener('click', () => {
                tasks.add(`Preparing download: ${name}`, async () => {
                  const buffer = new Uint8Array(size);
                  await reader.openFile(entryPath);
                  let chunk, offset = 0;
                  while ((chunk = await reader.readFile()).byteLength !== 0) {
                    buffer.set(chunk, offset);
                    offset += chunk.byteLength;
                  }
                  await reader.closeFile();
                  return buffer;
                }).then((buffer) => {
                  const blob = new Blob([buffer]);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = name;
                  a.style.display = 'none';
                  document.body.appendChild(a);
                  a.click();
                  URL.revokeObjectURL(url);
                });
              });

              buttons.appendChild(downloadButton);
              createAndShowDialog(`File: ${name}`, dialogBody, buttons);
            }
          });

          lastElement = child;
        }
        lastElement.classList.add('rounded-b-lg');
      });
    }

    showDirectoryContents([]);

    return browserElement;
  }

  const setupBox = document.getElementById('setup-box');
  const contentContainer = document.getElementById('content');

  const fileInput = document.getElementById('img-file-input');
  const blockSizeInput = document.getElementById('img-block-size-input');
  const blockCountInput = document.getElementById('img-block-count-input');
  const readSizeInput = document.getElementById('img-read-size-input');
  const cacheSizeInput = document.getElementById('img-cache-size-input');
  const lookaheadSizeInput = document.getElementById('img-lookahead-size-input');
  const maxCachedBlocksInput = document.getElementById('max-cached-blocks-input');

  cacheSizeInput.setAttribute('max', appResources.definitions.MAX_CACHE_SIZE);
  lookaheadSizeInput.setAttribute('max', appResources.definitions.MAX_LOOKAHEAD_SIZE);

  function getOptionValues(obj) {
    const ret = {};
    for (const key of Object.getOwnPropertyNames(obj)) {
      const val = obj[key].value.trim();
      ret[key] = val && parseInt(val, 10);
      if (ret[key] < 0) {
        throw new Error('Negative values are invalid');
      }
    }
    return ret;
  }

  function getOptions(fileSize) {
    const v = getOptionValues({
      blockSize: blockSizeInput,
      blockCount: blockCountInput,
      readSize: readSizeInput,
      cacheSize: cacheSizeInput,
      lookaheadSize: lookaheadSizeInput,
      maxCachedBlocks: maxCachedBlocksInput
    });

    if (!v.blockSize) {
      throw new Error('Block size must be specified');
    }

    if (!v.blockCount) {
      v.blockCount = 1 << (Math.ceil(Math.log2(fileSize / v.blockSize)));
    } else if (v.blockCount * v.blockSize < fileSize) {
      throw new Error(`The disk image has a size of ${fileSize} bytes, which is larger than ${v.blockCount} * ${v.blockSize}.`);
    }

    if (!v.readSize) {
      v.readSize = 1;
    } else if (v.blockSize % v.readSize !== 0) {
      throw new Error('The block size must be a multiple of the read size');
    }

    if (!v.cacheSize) {
      const max = Math.min(v.blockSize, appResources.definitions.MAX_CACHE_SIZE);
      v.cacheSize = v.readSize * Math.floor(max / v.readSize);
    } else if (v.cacheSize % v.readSize !== 0) {
      throw new Error('The cache size must be a multiple of the read size');
    } else if (v.blockSize % v.cacheSize !== 0) {
      throw new Error('The block size must be a multiple of the cache size');
    }

    if (!v.lookaheadSize) {
      v.lookaheadSize = appResources.definitions.MAX_LOOKAHEAD_SIZE;
    } else if (v.lookaheadSize % 8 !== 0) {
      throw new Error('The lookahead size must be a multiple of 8');
    }

    if (!v.maxCachedBlocks) {
      v.maxCachedBlocks = Math.min(v.blockCount, Math.floor(1024 * 1024 / v.blockSize));
    }

    return v;
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];

      let opts;
      try {
        opts = getOptions(file.size);
      } catch (err) {
        alert('Error: ' + String(err));
        return;
      }

      const {
        blockSize,
        blockCount,
        readSize,
        cacheSize,
        lookaheadSize,
        maxCachedBlocks
      } = opts;

      const read = createFileReader(file, blockSize, blockCount, maxCachedBlocks);

      const tasks = new TaskQueue();

      createLfsImageReader({ read }).then(async (reader) => {
        setupBox.classList.add('hidden');
        const container = contentContainer.appendChild($('div'));
        container.append($('hr'), $.into($('div', ['text-sm', 'my-4']), [
          $.text($('span', ['font-bold']), file.name),
          ` (${file.size.toLocaleString('en-US')} bytes). `,
          $.on($.text($('a', ['text-blue-600', 'hover:underline'], { href: '#' }), 'Change'), 'click', (event) => {
            event.preventDefault();
            contentContainer.removeChild(container);
            setupBox.classList.remove('hidden');
          })
        ]), $('hr'));

        await tasks.add('Mount', () => reader.openImage(readSize, cacheSize, lookaheadSize, blockSize, blockCount));

        const nPerRow = 128;
        container.append(
          buildBlockOverview(reader, tasks, blockCount, nPerRow),
          $('hr'),
          createDirectoryBrowser(reader, tasks)
        );
      })
      .catch((err) => {
        alert('Error: ' +  err);
      });
    }
  });

  const aboutButton = document.getElementById('about-button');
  aboutButton.addEventListener('click', (event) => {
    event.preventDefault();

    const sw = appResources.softwareInfo;
    const licenses = {};

    const dialogBody = $.into($('div'), [
      $.text($('p', ['my-2']), 'This web application contains the following software components.'),
      ...sw.map(({ name, version, repo, license }) => {
        const licenseDisplay = $.text($('pre', ['border', 'p-2', 'my-2', 'text-xs', 'max-h-52', 'overflow-y-scroll', 'hidden']), license);
        return $.into($('div', ['my-6']), [
          $.text($('span', ['font-bold']), name),
          ` (${version})`,
          $.into($('div'), [
            $.text($('a', ['text-blue-600'], { href: repo, target: '_blank', noopener: '', noreferrer: '' }), 'GitHub'),
            ' • ',
            $.on($.text($('a', ['text-blue-600'], { href: '#' }), 'License'), 'click', (event) => {
              event.preventDefault();
              licenseDisplay.classList.toggle('hidden');
            })
          ]),
          licenseDisplay
        ]);
      })
    ]);

    const aboutDialog = createAndShowDialog('About', dialogBody);
  });
})();
