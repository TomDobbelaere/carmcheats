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
const { spawn } = require('child_process');
let lastTime = new Date();
let lastFound = 0;
let eta = 0;

let workers = [];

// TODO: read processed_words and filter them out

const dictionaryWords = fs.readFileSync(path.join(__dirname, "words_alpha.dic")).toString()
  .split('\r\n')
  .filter(word => word.length < length && word.length > 3)
  .sort((a, b) => {
    return a.length - b.length;
  });
const totalSize = dictionaryWords.length;

for (let i = 0; i < 6; i++) {
  createWorker();
}

function createWorker() {
  const crib = dictionaryWords.pop();
  const cribIndex = totalSize - dictionaryWords.length;
  const tag = getTag(crib, cribIndex);
  const worker = spawn(executable,
    ['-m', 'carmcheat.cheat_retrieval', hashTarget, length.toString(), '--crib', crib, '--database', 'c2.potfile'], {
    cwd: workingDirectory
  });
  workers.push(worker);

  console.log(`${tag} spawning`);

  worker.stdout.on('data', (data) => {
    console.log(`${tag} ${data}`);
  });

  worker.stderr.on('data', (data) => {
    console.error(`${tag} ${data}`);
  });

  worker.on('close', (code) => {
    const workerIndex = workers.indexOf(worker);
    if (workerIndex !== -1) {
      workers.splice(workerIndex, 1);
    } else {
      console.log(`${tag} Failed to properly clean up? This shouldn't happen..`);
    }

    console.log(`${tag} Exited with code ${code}`);

    try {
      fs.appendFile(path.join(__dirname, `processed_words.${length}.txt`), `${crib}\r\n`, () => {
        console.error(`Updated processed_words.${length}.txt`);
      });
    } catch (e) {
      console.error(`Could not update processed_words.${length}.txt`);
    }

    if (new Date() - lastTime > 1000 * 60) {
      try {
        updateETA();
      } catch (e) {
        console.error(e);
      }
    }

    createWorker();
  });
}

function getTag(crib, cribIndex) {
  return `[${length}.${crib}.(${cribIndex}/${totalSize}) ETA: ${eta} min.]`;
}

function updateETA() {
  const foundNow = totalSize - dictionaryWords.length;
  const foundDiff = foundNow - lastFound;
  const timeDiffMs = new Date() - lastTime;
  let amountPerSecond;

  if ((timeDiffMs / 1000) > 0) {
    amountPerSecond = foundDiff / (timeDiffMs / 1000);
  }

  if (amountPerSecond > 0) {
    eta = Math.round((dictionaryWords.length / amountPerSecond) / 60);
  }

  lastTime = new Date();
  lastFound = foundNow;
}