import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const storyboard = resolve(repoRoot, 'demo', 'multimind-demo-video.html');
const outArg = process.argv[2];
const output = resolve(outArg ?? '/opt/cursor/artifacts/multimind-animated-demo.mp4');
const framesDir = resolve('/tmp', 'multimind-demo-frames');
const chromeProfileDir = resolve('/tmp', 'multimind-demo-chrome-profile');
const slideCount = 9;
const width = 1920;
const height = 1080;
const fps = 30;
const secondsPerSlide = 4;
const framesPerSlide = fps * secondsPerSlide;

function findChrome() {
  const candidates = ['google-chrome', 'chromium', 'chromium-browser'];
  for (const bin of candidates) {
    const result = spawnSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' });
    const found = result.stdout.trim();
    if (found) return found;
  }
  throw new Error('No Chrome/Chromium binary found.');
}

const chrome = findChrome();
rmSync(framesDir, { recursive: true, force: true });
rmSync(chromeProfileDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(chromeProfileDir, { recursive: true });
mkdirSync(dirname(output), { recursive: true });

for (let slide = 0; slide < slideCount; slide += 1) {
  const target = `${pathToFileURL(storyboard).href}?slide=${slide}`;
  const screenshot = resolve(framesDir, `slide-${String(slide).padStart(2, '0')}.png`);
  execFileSync(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    `--user-data-dir=${chromeProfileDir}`,
    `--window-size=${width},${height}`,
    `--screenshot=${screenshot}`,
    target,
  ], { stdio: 'inherit' });
}

const filterParts = [];
const concatInputs = [];
for (let slide = 0; slide < slideCount; slide += 1) {
  filterParts.push(
    `[${slide}:v]scale=${width}:${height},` +
    `zoompan=z='min(zoom+0.00045,1.045)':d=${framesPerSlide}:s=${width}x${height}:fps=${fps},` +
    `fade=t=in:st=0:d=0.25,fade=t=out:st=${secondsPerSlide - 0.35}:d=0.35,` +
    `setsar=1,format=yuv420p[v${slide}]`
  );
  concatInputs.push(`[v${slide}]`);
}
filterParts.push(`${concatInputs.join('')}concat=n=${slideCount}:v=1:a=0[v]`);
const filter = filterParts.join(';');
const filterPath = resolve(framesDir, 'filter.txt');
writeFileSync(filterPath, filter);

const ffmpegArgs = [];
for (let slide = 0; slide < slideCount; slide += 1) {
  ffmpegArgs.push('-loop', '1', '-i', resolve(framesDir, `slide-${String(slide).padStart(2, '0')}.png`));
}
ffmpegArgs.push(
  '-filter_complex_script', filterPath,
  '-map', '[v]',
  '-r', String(fps),
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-y',
  output
);

execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
console.log(`Animated demo video written to: ${output}`);
