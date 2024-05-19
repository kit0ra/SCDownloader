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
