# Video Downloader Script

## Disclaimer

For educational purposes only. I am not responsible for any actions taken with this script. Please ensure that you have the right to download any content you intend to with this tool.

## Installation

1. **Clone the repository:**
   git clone https://github.com/kit0ra/SCDownloader.git

2. **Navigate to the project directory:**
   cd SCDownloader

3. **Install dependencies:**
   npm install

## Description

This script downloads videos from the specified URL. It allows users to specify various options such as resolution and whether to include the video title in the downloaded file's name.

## Usage

node index.js --url [url] -t --directory [path]

## Options

- `--version` - Show version number.
- `-u, --url` - URL of the video to download. **[required]**
- `-t, --title` - Download video with its title. [boolean] [default: false]
- `--directory, --dir` - Output directory for the downloaded video. [string] [default: "downloads"]
- `-r, --resolution` - Resolution of the video (options: hd, fullhd, ultrahd). [string] [default: "hd"]
- `-h, --help` - Show help information.

## Examples

1. **Download a video without specifying the title:**
   node index.js --url "https://example.com/video"

2. **Download a video with the title and specify the output directory:**
   node index.js --url "https://example.com/video" -t --directory "/path/to/save"

3. **Download a video with specific resolution:**
   node index.js --url "https://example.com/video" -r fullhd
