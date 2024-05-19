import axios from 'axios'
import fs from 'fs'
import path from 'path'
import {
  createWriteStream,
  readdirSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from 'fs'

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
