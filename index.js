import axios from 'axios'
import path from 'path'
import puppeteer from 'puppeteer'
import {
  createWriteStream,
  readdirSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from 'fs'
import { pipeline as pipelineCallback } from 'stream'
import { promisify } from 'util'
const pipeline = promisify(pipelineCallback)

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
  const filename = path.basename(url)
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
  const videosDir = path.join(process.cwd(), 'downloads')
  ensureDirExists(tmpDir)
  ensureDirExists(videosDir)

  const videoId = videoUrl.split('/').slice(-2, -1)[0]
  const resolution = 'hd'
  const chunks = prepareChunks(videoId, resolution)
  let downloadedFiles = []

  for (let i = 0; i < chunks.length; i += maxConcurrency) {
    const group = chunks.slice(i, i + maxConcurrency)
    const results = await Promise.all(
      group.map((url, idx) => downloadChunk(url, tmpDir, i + idx + 1))
    )
    downloadedFiles.push(...results.filter(r => r !== null))
    if (results.includes(null)) break // Break the loop if any null results (403 errors)
  }

  if (downloadedFiles.length > 0) {
    const outputFile = path.join(videosDir, `${videoId}.ts`)
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
  console.log(`Downloading video titled: ${title}`)
  await downloadVideo(url, maxConcurrency)
}
