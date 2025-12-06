document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('csvForm');
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');
    const messageDiv = document.getElementById('message');
    
    // Google Analytics helper function
    function trackEvent(action, category = 'CSV Processing', label = '', value = null) {
        if (typeof gtag !== 'undefined') {
            gtag('event', action, {
                event_category: category,
                event_label: label,
                value: value
            });
        }
    }
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        const csvFile = document.getElementById('csvFile').files[0];
        const columnToClean = document.getElementById('columnToClean').value.trim();
        const targetFormat = document.getElementById('targetFormat').value.trim();
        
        // Validation
        if (!csvFile) {
            showMessage('Please select a CSV file.', 'error');
            trackEvent('file_upload_failed', 'User Input', 'No file selected');
            return;
        }
        
        // Track file upload attempt
        trackEvent('file_upload_started', 'CSV Processing', `File size: ${(csvFile.size / 1024).toFixed(1)}KB`);
        
        // Column and format are now optional - if not provided, auto-cleaning will be used
        
        // Prepare form data
        formData.append('csvFile', csvFile);
        if (columnToClean) formData.append('columnToClean', columnToClean);
        if (targetFormat) formData.append('targetFormat', targetFormat);
        
        // Show loading state
        submitBtn.disabled = true;
        loading.style.display = 'block';
        messageDiv.innerHTML = '';
        
        try {
            const response = await fetch('/api/clean-csv', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                // Handle file download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `cleaned_${csvFile.name}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                showMessage('✅ CSV file cleaned successfully! Download should start automatically.', 'success');
                
                // Track successful processing
                trackEvent('csv_processed_successfully', 'CSV Processing', csvFile.name, csvFile.size);
                
                // Reset form
                form.reset();
            } else {
                const errorData = await response.json();
                const errorMessage = errorData.error || 'Failed to process CSV file';
                
                // Track processing error
                trackEvent('csv_processing_failed', 'CSV Processing', errorMessage);
                
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage(`❌ Error: ${error.message}`, 'error');
            
            // Track general error
            trackEvent('csv_processing_error', 'CSV Processing', error.message);
        } finally {
            // Hide loading state
            submitBtn.disabled = false;
            loading.style.display = 'none';
        }
    });
    
    function showMessage(message, type) {
        messageDiv.innerHTML = `<div class="${type}">${message}</div>`;
        messageDiv.scrollIntoView({ behavior: 'smooth' });
    }
    
    // File input validation
    document.getElementById('csvFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && !file.name.toLowerCase().endsWith('.csv')) {
            showMessage('Please select a valid CSV file.', 'error');
            trackEvent('invalid_file_selected', 'User Input', file.name);
            e.target.value = '';
        } else if (file) {
            // Track valid file selection
            trackEvent('valid_file_selected', 'User Input', `${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
        }
    });
});