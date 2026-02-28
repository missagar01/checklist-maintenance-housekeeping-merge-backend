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
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        const firstDayStr = `${y}-${m}-01`;

        console.log(`Testing range: ${firstDayStr} to ${todayStr}`);
        const response = await axios.get(url, {
            params: {
                role: 'admin',
                startDate: firstDayStr,
                endDate: todayStr
            }
        });
        
        const data = response.data;
        let totalSum = 0;
        let chkSum = 0;
        let hkSum = 0;
        let mntSum = 0;

        Object.keys(data).forEach(div => {
            const stats = data[div];
            totalSum += stats.total.count;
            chkSum += stats.total.breakdown.checklist;
            hkSum += stats.total.breakdown.housekeeping;
            mntSum += stats.total.breakdown.maintenance;
        });

        console.log(`Sum of Divisions (Total): ${totalSum}`);
        console.log(`Breakdown Sum -> CHK: ${chkSum}, HK: ${hkSum}, MNT: ${mntSum}`);
        console.log(`Global Dashboard Total: 411922`);
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

test();
