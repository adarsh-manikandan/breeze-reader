# Bionic Reader

A modern web application that converts text to bionic reading format, making it easier and faster to read. The app also supports EPUB file import for reading entire books with bionic formatting.

## Features

- **Bionic Reading**: Converts regular text to bionic format by emphasizing the beginning of words
- **EPUB Support**: Import and read entire EPUB books with bionic formatting
- **Chapter Navigation**: Navigate through book chapters with a table of contents
- **Bookmarking**: Save your reading progress
- **Font Size Control**: Adjust text size for comfortable reading
- **Copy to Clipboard**: Copy converted text easily
- **Modern UI**: Clean, responsive design with a warm color scheme

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

### Running the Application

Start the development server:

```bash
npm run dev
```

The application will open in your browser at `http://localhost:3000`

### Building for Production

To create a production build:

```bash
npm run build
```

## How to Use

### Text Mode
1. Paste or type your text in the input area
2. Click "Convert" to transform it to bionic format
3. Use the "Focus" button to hide the input panel for distraction-free reading
4. Adjust font size using the controls in the header
5. Copy the converted text using the copy button

### EPUB Mode
1. Click "Import EPUB" to upload an EPUB file
2. The book will be parsed and displayed in bionic format
3. Navigate between chapters using the previous/next buttons
4. Use the table of contents (menu button) to jump to specific chapters
5. Bookmark chapters for later reference

## Technology Stack

- **React 18**: Modern React with hooks
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Beautiful icon library
- **EPUB Parser**: Custom ZIP-based EPUB parser

## How Bionic Reading Works

Bionic reading emphasizes the first few letters of each word, creating visual fixation points that help your brain process text more efficiently. This technique can improve reading speed and comprehension by reducing cognitive load.

## License

MIT License - feel free to use this project for personal or commercial purposes. 