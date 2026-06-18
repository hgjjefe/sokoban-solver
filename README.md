# 🎮 Sokoban Solver & Game

> A modern, responsive web-based Sokoban puzzle game with an intelligent solver, level editor, and solution visualizer. Play classic push-the-box puzzles or let the AI solve them for you!

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Try_Now-blue?style=for-the-badge)](https://dangarfield.github.io/sokoban-solver/)

![Sokoban Solver Preview](https://i.ibb.co/ZSWtVfw/preview.gif)

## ✨ Features

### 🎯 Game & Solver
- **Intelligent AI Solver** - Primitive BFS algorithm with unoptimized performance
- **Real-time Progress** - Watch the solver work with live progress updates
- **Solution Playback** - Step through solutions move by move
- ~~**Multiple Algorithms** - Choose from BFS, DFS, UCS, or A* search methods~~

### 🎨 Level Editor
- **Visual Editor** - Click cells to cycle through floor, wall, block, target, and player
- **Responsive Grid** - Automatically scales to fit your screen
- **Custom Levels** - Create and save your own puzzles
- **Import/Export** - Share levels via URL with deep-linking support

### 🎮 Gameplay
- **Smooth Controls** - Play with WASD, arrow keys, or on-screen buttons
- ~~**Voice Control** - Use speech recognition for hands-free play~~
- **Mobile Friendly** - Fully responsive design works on all devices
- **Auto-progression** - Automatically advance to next level when solved

### 💾 Data Management
- ~~**Local Storage** - All progress saved in your browser~~
- **Level Sharing** - Generate shareable URLs for custom levels
- **Reset Option** - Clear all data and start fresh
- ~~**Cached Solutions** - Previously solved puzzles load instantly~~

## 🚀 Quick Start

### Local Development
```bash
# Clone the repository
git clone https://github.com/hgjjefe/sokoban-solver.git
cd sokoban-solver

# Serve locally (any web server works)
npx serve .
# or
python -m http.server 8000
# or
php -S localhost:8000

# Open http://localhost:8000 in your browser

Or use VSCode live server or whatever
```

## 🎮 How to Play

### Basic Controls
- **Movement**: `WASD` keys or arrow keys
- **Reset Level**: `Escape` or `R`
- **Voice Commands**: Say "up", "down", "left", "right", or "restart"

### Level Editor
1. **Click any cell** to cycle through types:
   - Floor (empty space)
   - Wall (obstacle)
   - Block (pushable box)
   - Target (goal position)
   - Player (starting position)
   - Target & Block together
   - Target & Player together

2. **Save your level** using the save button
3. **Share your creation** with the export button

### Using the Solver
1. **Click "Solve"** to start the AI solver
2. **Watch progress** as it explores possible moves
3. **Navigate solution** with Previous/Next buttons
4. **Solutions are cached** for instant replay

## 🧠 Solver Algorithm

The application uses a **Typescript solver** I wrote with the assistance of Gemini. 

### Solver Algorithm Overview

**Key Features:**
- **Simple BFS** - Find minimum moves solution but least effecient
- **BFS by push** - Find minimum pushes solution. A bit more effecient
- **A*** - Use box-goal distance as heuristics, so it searches the path that reduces total box-goal distance first. Most effecient, but the solution move sequence is weird
- **Deadlock detection** - Only considers pushable floor space and avoids 2x2 freeze deadlocks
- **Zobrist Hashing** - Store each explored board state as a 64-bit integer to avoid repeating the state

## 🎨 Level Format

Levels use the standard XSB (Extended Sokoban) text format:
```
Level: My Custom Level
########
#  .   #
# $  @ #
#      #
########
```

**Symbols (XSB Standard):**
- `#` = Wall
- ` ` = Floor (empty space)
- `$` = Box (crate to push)
- `.` = Goal (target position)
- `@` = Player starting position
- `*` = Box on goal
- `+` = Player on goal

## 🔧 Configuration

### Adding Levels
Edit `grids/Base-Levels.txt` to include new puzzles using XSB format:
```
Level: Easy Puzzle
####
#.@#
#$ #
####

Level: Medium Challenge
#######
#.  @ #
# $$  #
#  .  #
#######
```

~~## 🤝 Contributing~~

~~This project builds upon excellent work from:~~
~~- [KnightofLuna/sokoban-solver](https://github.com/KnightofLuna/sokoban-solver) - Original web interface~~
~~- [Festival Solver](http://www.sokobano.de/wiki/index.php?title=Solver:Festival) - High-performance C++ solver by Yaron Shoham~~

### Technology Stack
- **Frontend**: Vanilla JavaScript, Bootstrap 5
- **Solver**: Rust compiled to WebAssembly
- **Algorithm**: Festival solver (pattern databases, advanced pruning)
- **Performance**: Web Workers for non-blocking UI

