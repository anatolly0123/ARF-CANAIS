const { Jimp } = require('jimp');
const path = require('path');

async function createIcons() {
    const source = 'c:/Users/anatollyfreitas/Downloads/IMG_1667.jpeg';
    const publicDir = 'c:/Users/anatollyfreitas/Downloads/arf-canais-admin/ARF-CANAIS/public';

    try {
        const image = await Jimp.read(source);
        const w = image.bitmap.width;
        const h = image.bitmap.height;
        const size = Math.max(w, h);

        // Create square canvas with black background
        const square = new Jimp({ width: size, height: size, color: 0x000000FF });

        // Center the original image
        square.composite(image, (size - w) / 2, (size - h) / 2);

        // Write icons
        const icon192 = square.clone().resize({ w: 192, h: 192 });
        await icon192.write(path.join(publicDir, 'icon-192.png'));

        const icon512 = square.clone().resize({ w: 512, h: 512 });
        await icon512.write(path.join(publicDir, 'icon-512.png'));

        const appleIcon = square.clone().resize({ w: 180, h: 180 });
        await appleIcon.write(path.join(publicDir, 'apple-touch-icon.png'));

        console.log('Icons created successfully!');
    } catch (err) {
        console.error('Error creating icons:', err);
        process.exit(1);
    }
}

createIcons();
