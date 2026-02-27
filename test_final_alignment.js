import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const port = 5050;
const url = `http://localhost:${port}/api/dashboard/division-wise-counts`;

async function test() {
    try {
        console.log(`Testing API at: ${url}`);
        const response = await axios.get(url, {
            params: {
                role: 'admin'
            }
        });
        
        const data = response.data;
        Object.keys(data).forEach(div => {
            const stats = data[div];
            
            // This mirrors the frontend calculation
            const dashboardTotal = (stats.completed?.count || 0) + 
                                 (stats.pending?.count || 0) + 
                                 (stats.notDone?.count || 0) + 
                                 (stats.overdue?.count || 0);
            
            console.log(`${div}:`);
            console.log(`  Dashboard Total (Sum up to today): ${dashboardTotal}`);
            console.log(`  Future Tasks (Tomorrow onwards): ${stats.future.count}`);
            console.log(`  Full Month Total (Manual Query Match): ${dashboardTotal + stats.future.count}`);
        });

        // Test sum matching 411,922
        let totalSum = 0;
        Object.keys(data).forEach(div => {
            const stats = data[div];
            totalSum += (stats.completed?.count || 0) + (stats.pending?.count || 0) + (stats.notDone?.count || 0) + (stats.overdue?.count || 0);
        });
        console.log(`\nCombined Division Total (Dashboard Match): ${totalSum}`);
        console.log(`Expected: 411922`);

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

test();
