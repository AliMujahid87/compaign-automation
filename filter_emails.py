import csv
import os
import re

# Aapki original file ka naam
input_file = '8000000.csv'
# Nayi file ka naam jo banegi
output_file = 'authentic_emails.csv'

def is_real_name(name):
    if not name or len(name) < 2:
        return False
    # Common placeholder words
    placeholders = {'unknown', 'null', 'none', 'user', 'n/a', 'na', 'admin', 'profile', 'test'}
    if name.lower() in placeholders:
        return False
    # Check if it contains at least one letter
    if not any(c.isalpha() for c in name):
        return False
    return True

def filter_emails():
    print("Email data fetch ho raha hai, thora intezar karein...")

    if not os.path.exists(input_file):
        print(f"Error: '{input_file}' nahi mili.")
        return

    # Email validation regex
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    try:
        with open(input_file, mode='r', encoding='utf-8') as infile, \
             open(output_file, mode='w', encoding='utf-8', newline='') as outfile:
            
            reader = csv.DictReader(infile)
            writer = csv.writer(outfile)
            
            # Nayi file mein header add karna
            writer.writerow(['Name', 'Email']) 
            
            count = 0
            unique_emails = set()
            max_limit = 5000
            
            print(f"Searching for {max_limit} authentic emails with real names...")

            for row in reader:
                if count >= max_limit:
                    break
                    
                # Case-insensitive search for columns
                email_key = next((k for k in row if k.lower() == 'email'), None)
                name_key = next((k for k in row if k.lower() == 'name'), None)
                
                email = str(row.get(email_key, '')).strip() if email_key else ''
                name = str(row.get(name_key, '')).strip() if name_key else ''
                
                # Agar name real nahi lag raha toh empty kar do
                if not is_real_name(name):
                    name = ""
                
                # Authenticity check:
                if (re.match(email_regex, email) and 
                    email.lower() not in unique_emails):
                    
                    writer.writerow([name, email])
                    unique_emails.add(email.lower())
                    count += 1
                    
                    if count % 500 == 0:
                        print(f"Progress: {count} emails fetched...")

        print(f"Mubarak ho! Kaam mukammal ho gaya.")
        print(f"Total {count} unique aur authentic emails '{output_file}' mein save ho gaye hain.")

    except Exception as e:
        print(f"Ek unexpected error pesh aya: {e}")

if __name__ == "__main__":
    filter_emails()
