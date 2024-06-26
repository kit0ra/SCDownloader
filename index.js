import axios from 'axios'
import path from 'path'
import puppeteer from 'puppeteer'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
  createWriteStream,
  readFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from 'fs'
import { pipeline as pipelineCallback } from 'stream'
import { promisify } from 'util'
const pipeline = promisify(pipelineCallback)

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 --url [url] -t -directory [path]')
  .option('url', {
    describe: 'URL of the video to download',
    alias: 'u',
    type: 'string',
    demandOption: true, // The URL is required
  })
  .option('t', {
    alias: 'title',
    describe: 'Download video with its title',
    type: 'boolean',
    default: false,
  })
  .option('directory', {
    alias: 'dir',
    describe: 'Output directory for the downloaded video',
    type: 'string',
    default: 'downloads', // Default directory
  })
  .option('resolution', {
    alias: 'r',
    describe: 'Resolution of the video (hd, fullhd, ultrahd)',
    type: 'string',
    default: 'hd', // Default resolution
  })
  .help('h')
  .alias('h', 'help').argv

const RESOLUTIONS = {
  hd: 1500,
  fullhd: 2500,
  ultrahd: 4000,
}

function ensureDirExists(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

function prepareChunks(videoId, resolution) {
  const selectedResolution = RESOLUTIONS[resolution]
  const baseUrl = `https://d13z5uuzt1wkbz.cloudfront.net/${videoId}`
  const urls = []
  for (let i = 1; i <= 1000; i++) {
    const paddedIndex = String(i).padStart(5, '0')
    const url = `${baseUrl}/HIDDEN${selectedResolution}-${paddedIndex}.ts`
    urls.push(url)
  }
  return urls
}

async function downloadChunk(url, destDir, index) {
  const filename = `chunk-${index}.ts`
  const dest = path.join(destDir, filename)

  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
    })
    if (response.status === 403) {
      console.error(`Access denied for chunk ${index}: 403 Forbidden`)
      return null
    }
    const totalLength = response.headers['content-length']
    let currentLength = 0
    response.data.on('data', chunk => {
      currentLength += chunk.length
      const percentage = ((currentLength / totalLength) * 100).toFixed(2)
      process.stdout.write(`\rChunk ${index}: Downloading ${percentage}%`)
    })
    await pipeline(response.data, createWriteStream(dest))
    console.log(`\nChunk ${index}: Download finished`)
    return dest
  } catch (error) {
    console.error(`\nChunk ${index}: Failed to download. Error: ${error}`)
    return null
  }
}

function concatenateChunks(files, outputFile) {
  return new Promise((resolve, reject) => {
    ensureDirExists(path.dirname(outputFile))
    const output = createWriteStream(outputFile)
    console.log('Assembling video...')

    files.forEach(file => {
      const data = readFileSync(file)
      output.write(data)
      unlinkSync(file) // Remove the file after appending
    })

    output.on('finish', () => {
      console.log(
        `Video titled "${path.basename(
          outputFile
        )}" saved in location: ${outputFile}`
      )
      resolve()
    })
    output.on('error', reject)

    output.end()
  })
}

async function downloadVideo(videoUrl, maxConcurrency = 3) {
  const tmpDir = path.join(process.cwd(), 'tmp')
  const videosDir = path.join(argv.directory)
  ensureDirExists(tmpDir)
  ensureDirExists(videosDir)

  const videoId = videoUrl.split('/').slice(-2, -1)[0]
  const resolution = argv.resolution
  console.log(
    `Downloading video with ID: ${videoId} and resolution: ${resolution}`
  )
  const chunks = prepareChunks(videoId, resolution)
  let downloadedFiles = []

  for (let i = 0; i < chunks.length; i += maxConcurrency) {
    const group = chunks.slice(i, i + maxConcurrency)
    const results = await Promise.all(
      group.map((url, idx) => downloadChunk(url, tmpDir, i + idx + 1))
    )
    downloadedFiles.push(...results.filter(r => r !== null))
    if (results.includes(null)) break // Break if any chunks fail (e.g., 403 error)
  }

  outputFile = path.join(videosDir, `${videoId}.ts`)

  if (downloadedFiles.length > 0) {
    await concatenateChunks(downloadedFiles, outputFile)
  } else {
    console.error('No chunks were downloaded successfully.')
  }
}

async function fetchData(url) {
  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    slowMo: 250,
  })
  const page = await browser.newPage()

  try {
    console.log(`Navigating to ${url}...`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 })
    console.log('Page loaded.')
    console.log('waiting for selector...')
    await page.waitForSelector('.css-1w71aej', { visible: true })
    console.log('selector ready')
    await page.evaluate(() => {
      let btn = document.querySelector('.css-1w71aej')
      if (btn) btn.click()
    })
    await page.waitForSelector('.css-1mkvlph', { visible: true })
    const titles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.css-1mkvlph')).map(el =>
        el.textContent.trim()
      )
    })
    const videoIds = await page.evaluate(() => {
      const VIDEO_PREFIX = 'BrVidRow-'
      const divs = document.querySelectorAll(`div[id^="${VIDEO_PREFIX}"]`)
      return Array.from(divs).map(div => div.id.substring(VIDEO_PREFIX.length))
    })

    await browser.close()

    const data = {}
    for (let i = 0; i < videoIds.length; i++) {
      data[videoIds[i]] = titles[i]
    }
    return data
  } catch (error) {
    console.error(`Failed to navigate: ${error.message}`)
    await browser.close()
    return null
  }
}

function findTitle(data, id) {
  return data[id] || 'Title not found'
}

async function downloadVideoWithTitle(url, maxConcurrency = 3) {
  const data = await fetchData(url)
  if (!data) {
    console.error('Failed to fetch data. Exiting...')
    return
  }

  const videoId = url.split('/').slice(-2, -1)[0]
  const title = findTitle(data, videoId)
  console.log(
    `Downloading video titled: ${title} with the resolution: ${argv.resolution}`
  )
  await downloadVideo(url, maxConcurrency)
}

async function main() {
  const { url, title } = argv
  try {
    if (title) {
      await downloadVideoWithTitle(url)
    } else {
      await downloadVideo(url)
    }
  } catch (error) {
    console.error('An error occurred:', error)
    process.exit(1) // Exit with error code 1
  } finally {
    console.log('Process completed.')
    process.exit(0)
  }
}

main()
