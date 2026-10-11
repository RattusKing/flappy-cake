# 🍰 Flappy Cake

A cute, professional 2D browser game where you guide a kawaii cake through candle obstacles!

## Features

- ✨ Smooth physics and controls
- 🎨 Neon cyberpunk aesthetic with colorful background
- 🍰 Adorable animated cake character
- 🕯️ Dynamic candle obstacles
- 💫 Particle effects
- 🎵 Sound effects
- 📊 High score tracking (localStorage)
- 📱 Responsive design

## How to Play

- **Click** or press **SPACE** to make the cake flap
- Avoid hitting the candles or the ground/ceiling
- Try to beat your high score!

## Power-Ups

Glowing orbs occasionally float between the candles (roughly one every 9 candles). Fly through one to grab it. They only last for the current run.

| Item | Effect | Rarity |
| --- | --- | --- |
| ⚡ Speed Up | Everything scrolls 1.3x faster for 6s | Common |
| 🐢 Slow Down | Everything scrolls 1.3x slower for 6s | Common |
| 🧁 Mini Cake | Smaller cake and hitbox for 7s | Common |
| 🍦 Double Scoop | Each candle is worth 2 points for 8s | Common |
| 🔮 X-Ray Frosting | Shows where the next two gaps will be for 10s | Uncommon |
| 🧲 Magnet | Pulls pickups toward you, and they show up more often, for 10s | Uncommon |
| 🛡️ Shield | Absorbs one hit (candle, floor or ceiling) | Uncommon |
| 💨 Candle Snuffer | Blows out the next candle so you can fly through it | Uncommon |
| 👻 Ghost Rush | Pass through candles at 1.5x speed for 5s | Rare |
| ❤️ Extra Life | One revive that keeps your score | Rare |

## Deployment to GitHub Pages

### Option 1: Quick Deploy (Recommended)

1. Create a new repository on GitHub
2. Upload these files to the repository:
   - `index.html`
   - `game.js`
3. Go to Settings → Pages
4. Under "Source", select "main" branch
5. Click Save
6. Your game will be live at: `https://yourusername.github.io/repository-name`

### Option 2: Using Git Commands

```bash
# Initialize git in the project folder
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Flappy Cake game"

# Add your GitHub repository as remote
git remote add origin https://github.com/yourusername/flappy-cake.git

# Push to GitHub
git branch -M main
git push -u origin main

# Enable GitHub Pages in repository settings
```

## File Structure

```
flappy-cake/
├── index.html    # Main HTML file with UI
├── game.js       # Game logic and rendering
└── README.md     # This file
```

## Technical Details

- **Engine**: Pure HTML5 Canvas + JavaScript
- **No external dependencies** - runs anywhere!
- **60 FPS** smooth gameplay
- **Collision detection** using AABB (Axis-Aligned Bounding Box)
- **Particle system** for visual effects
- **Web Audio API** for sound effects

## Customization

You can easily customize the game by editing `game.js`:

- **Difficulty**: Adjust `CONFIG.candles.gap` (obstacle spacing)
- **Speed**: Change `CONFIG.candles.speed`
- **Colors**: Modify `CONFIG.colors` object
- **Cake size**: Update `CONFIG.cake.size`

## Browser Compatibility

Works on all modern browsers:
- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## Credits

Created with Claude AI
Built with ❤️ and HTML5 Canvas

## License

Feel free to use and modify for personal or commercial projects!
