import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const port = process.env.PORT || 5050;
const url = `http://localhost:${port}/api/dashboard/division-wise-counts`;

async function test() {
    try {
        console.log(`Testing API at: ${url}`);
        const response = await axios.get(url, {
            params: {
                role: 'admin'
            }
        });
        console.log('Response Status:', response.status);
        const data = response.data;
        console.log('Response Data Summary (Full Month Range Check):');
        Object.keys(data).forEach(div => {
            const stats = data[div];
            console.log(`${div}: Total=${stats.total}`);
        });
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

test();
