import http from 'http';

const options = {
    hostname: 'localhost',
    port: 5050,
    path: `/api/tasks/checklist`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const payload = JSON.stringify({
    page: 0,
    pageSize: 50,
    nameFilter: 'Shravan Nirmalkar'
});

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("Total Count:", json.total);
            console.log("Returned tasks:", json.data ? json.data.length : 0);
            if (json.data && json.data.length > 0) {
                console.log("First task sample:", json.data[0].task_id, json.data[0].name, json.data[0].task_description);
            } else {
                console.log("Full response:", json);
            }
        } catch (e) {
            console.log("Raw output:", data);
        }
    });
});

req.on('error', (error) => {
    console.error(error);
});

req.write(payload);
req.end();
