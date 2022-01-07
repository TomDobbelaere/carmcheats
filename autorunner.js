if (!process.argv[2]) {
  console.error("No length specified, dummy");
  return;
}
const length = +process.argv[2];

const fs = require('fs');
const path = require('path');
const executable = `C:\\Users\\tomdo\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`;
const workingDirectory = `D:\\Git repos\\carmcheats`;
const hashTarget = "4b054b60:6b6736cb";
const hashSum = parseInt(hashTarget.split(':')[0], 16) >> 21;
console.log(`Hashsum is ${hashSum}`);

const { spawn } = require('child_process');
let lastTime = new Date();
let lastFound = 0;
let eta = 0;
let amountPerSecond = 0;

let workers = [];
let maxWorkers = 6;

const processedWordsFileName = `processed_words.${length}.txt`;
const processedWordsFile = path.join(__dirname, processedWordsFileName);

const processedWords = fs.existsSync(processedWordsFile) ? fs.readFileSync(processedWordsFile).toString()
  .split('\n')
  .filter(e => !!e.trim())
  : [];

const hasProcessed = processedWords.reduce((acc, word) => {
  acc[word] = true;

  return acc;
}, {});
console.log(`[!] Ignoring ${processedWords.length} already processed words`);

let sumRejections = 0;
const dictionaryWords = fs.readFileSync(path.join(__dirname, "words_alpha.dic")).toString()
  .split('\r\n')
  .filter(word => {
    const cSum = carmaSum(word);
    const remainingChars = length - word.length;
    const isSumInvalid = 22 * remainingChars + cSum > 600 || 47 * remainingChars + cSum < 600;

    if (isSumInvalid) {
      sumRejections++;
    }

    return !isSumInvalid && word.length < length && !hasProcessed[word];
  })
  .sort((a, b) => {
    return a.length - b.length;
  });
const totalSize = dictionaryWords.length;

console.log(`[!] ${sumRejections} sum rejections`);


readAndParseConfig();
fs.watchFile(path.join(__dirname, "arconfig.json"), {
  interval: 1000,
}, () => {
  readAndParseConfig();
});

function createWorker() {
  const crib = dictionaryWords.pop();
  const cribIndex = totalSize - dictionaryWords.length;
  const worker = spawn(executable,
    ['-m', 'carmcheat.cheat_retrieval', hashTarget, length.toString(), '--crib', crib, '--database', 'c2.potfile'], {
    cwd: workingDirectory
  });
  workers.push({
    crib,
    worker
  });
  const tag = () => getTag(crib, cribIndex);

  console.log(`${tag()} Spawning`);

  worker.stdout.on('data', (data) => {
    console.log(`${tag()} ${data}`);
  });

  worker.stderr.on('data', (data) => {
    console.error(`${tag()} ${data}`);
  });

  worker.on('close', (code) => {
    console.log(`${tag()} Exited with code ${code}`);

    try {
      fs.appendFile(processedWordsFile, `${crib}\r\n`, () => {
        console.error(`Updated ${processedWordsFileName}`);
      });
    } catch (e) {
      console.error(`Could not update ${processedWordsFileName}`);
    }

    if (new Date() - lastTime > 1000 * 60) {
      try {
        updateETA();
      } catch (e) {
        console.error(e);
      }
    }

    const workerIndex = workers.findIndex(w => w.crib === crib);
    if (workerIndex !== -1) {
      workers.splice(workerIndex, 1);
    } else {
      console.log(`${tag()} Failed to properly clean up? This shouldn't happen..`);
    }

    while (workers.length < maxWorkers) {
      createWorker();
    }
  });
}

function getTag(crib, cribIndex) {
  return `[${length} ${crib} (${crib.length}) Word: ${cribIndex}/${totalSize} ETA: ${eta} min. ${workers.length}/${maxWorkers} workers]`;
}

function updateETA() {
  const foundNow = totalSize - dictionaryWords.length;
  const foundDiff = foundNow - lastFound;
  const timeDiffMs = new Date() - lastTime;

  if ((timeDiffMs / 1000) > 0) {
    amountPerSecond = foundDiff / (timeDiffMs / 1000);
  }

  if (amountPerSecond > 0) {
    eta = Math.round((dictionaryWords.length / amountPerSecond) / 60);
  }

  lastTime = new Date();
  lastFound = foundNow;
}

function readAndParseConfig() {
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, "arconfig.json")));

  const { workerCount } = conf;

  maxWorkers = workerCount;

  while (workers.length < maxWorkers) {
    createWorker();
  }
}

function carmaSum(text) {
  return text.split('').map(e => e.charCodeAt(0) - 75).reduce((s, v) => s + v, 0);
}