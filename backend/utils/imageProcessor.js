const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

class ImageProcessor {
  // Process and optimize ID images
  static async processIDImage(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      width: 1200,
      height: 800,
      quality: 80,
      format: 'jpeg'
    };

    const config = { ...defaultOptions, ...options };

    try {
      await sharp(inputPath)
        .resize(config.width, config.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: config.quality,
          progressive: true 
        })
        .toFile(outputPath);

      // Delete original file after processing
      fs.unlinkSync(inputPath);
      
      return outputPath;
    } catch (error) {
      console.error('Image processing error:', error);
      throw error;
    }
  }

  // Generate thumbnail
  static async generateThumbnail(inputPath, outputPath) {
    try {
      await sharp(inputPath)
        .resize(300, 200, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 70 })
        .toFile(outputPath);

      return outputPath;
    } catch (error) {
      console.error('Thumbnail generation error:', error);
      throw error;
    }
  }

  // Validate image
  static async validateImage(filePath) {
    try {
      const metadata = await sharp(filePath).metadata();
      
      // Check if it's an image
      if (!metadata.format) {
        throw new Error('Invalid image file');
      }

      // Check dimensions (minimum requirements for ID images)
      if (metadata.width < 600 || metadata.height < 400) {
        throw new Error('Image too small. Minimum 600x400 pixels required.');
      }

      return metadata;
    } catch (error) {
      throw new Error(`Image validation failed: ${error.message}`);
    }
  }
}

module.exports = ImageProcessor;