#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');

// Start ngrok
console.log('🚀 Starting ngrok...');
const ngrok = spawn('ngrok', ['http', '3000'], {
  stdio: 'pipe',
  shell: true,
});

let ngrokUrl = null;

// Wait for ngrok to start and get the URL
const checkNgrokUrl = () => {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const tunnels = JSON.parse(data);
          const httpsTunnel = tunnels.tunnels?.find(
            (t) => t.proto === 'https'
          );
          if (httpsTunnel) {
            resolve(httpsTunnel.public_url);
          } else {
            reject(new Error('No HTTPS tunnel found'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout waiting for ngrok API'));
    });
  });
};

// Poll ngrok API until it's ready
const waitForNgrok = async (maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const url = await checkNgrokUrl();
      return url;
    } catch (error) {
      if (i === maxAttempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

// Start Next.js dev server
const startNext = (ngrokUrl) => {
  console.log(`\n✅ Ngrok URL: ${ngrokUrl}`);
  console.log(`\n📝 Set this in your .env.local file:`);
  console.log(`   NEXT_PUBLIC_NGROK_URL=${ngrokUrl}\n`);
  console.log('🚀 Starting Next.js dev server...\n');

  const next = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_NGROK_URL: ngrokUrl,
    },
  });

  next.on('close', (code) => {
    console.log(`\nNext.js process exited with code ${code}`);
    ngrok.kill();
    process.exit(code);
  });
};

// Handle ngrok output
ngrok.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('started tunnel') || output.includes('Forwarding')) {
    // Ngrok is starting, wait a bit then check for URL
    setTimeout(async () => {
      try {
        ngrokUrl = await waitForNgrok();
        startNext(ngrokUrl);
      } catch (error) {
        console.error('❌ Failed to get ngrok URL:', error.message);
        console.error('Make sure ngrok is installed and port 4040 is available');
        ngrok.kill();
        process.exit(1);
      }
    }, 2000);
  }
});

ngrok.stderr.on('data', (data) => {
  const output = data.toString();
  // Ignore ngrok info messages
  if (!output.includes('INFO') && !output.includes('started tunnel')) {
    console.error('ngrok:', output);
  }
});

ngrok.on('close', (code) => {
  console.log(`\nngrok process exited with code ${code}`);
  process.exit(code);
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down...');
  ngrok.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  ngrok.kill();
  process.exit(0);
});

