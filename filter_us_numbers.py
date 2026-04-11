import csv
import os

# Aapki original file ka naam
input_file = '8000000.csv'
# Nayi file ka naam jo banegi
output_file = 'us_numbers_only.csv'

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

def filter_us_numbers():
    print("Data fetch ho raha hai, thora intezar karein...")

    if not os.path.exists(input_file):
        print(f"Error: '{input_file}' nahi mili. Bara-e-meharbani check karein ke file aur script ek hi folder mein hain.")
        return

    try:
        with open(input_file, mode='r', encoding='utf-8') as infile, \
             open(output_file, mode='w', encoding='utf-8', newline='') as outfile:
            
            reader = csv.DictReader(infile)
            writer = csv.writer(outfile)
            
            # Nayi file mein header add karna
            writer.writerow(['Name', 'Phone Number']) 
            
            count = 0
            unique_numbers = set()
            max_limit = 5000
            
            print(f"Searching for {max_limit} authentic US numbers with real names...")

            for row in reader:
                if count >= max_limit:
                    break
                    
                # Case-insensitive search for columns
                phone_key = next((k for k in row if k.lower() == 'phone'), None)
                name_key = next((k for k in row if k.lower() == 'name'), None)
                
                phone = str(row.get(phone_key, '')).strip() if phone_key else ''
                name = str(row.get(name_key, '')).strip() if name_key else ''
                
                # Agar name real nahi lag raha toh empty kar do
                if not is_real_name(name):
                    name = ""
                
                # Authenticity check for phone
                # Remove all non-digits for cleaning
                digits = "".join(filter(str.isdigit, phone))
                
                # US numbers are 10 digits (local) or 11 digits (starting with 1)
                clean_phone = ""
                if len(digits) == 10:
                    clean_phone = "+1" + digits
                elif len(digits) == 11 and digits.startswith('1'):
                    clean_phone = "+" + digits
                
                if (clean_phone and 
                    clean_phone not in unique_numbers):
                    
                    writer.writerow([name, clean_phone])
                    unique_numbers.add(clean_phone)
                    count += 1
                    
                    if count % 500 == 0:
                        print(f"Progress: {count} numbers fetched...")

            print(f"Mubarak ho! Kaam mukammal ho gaya.")
            print(f"Total {count} unique aur authentic US numbers '{output_file}' mein save ho gaye hain.")

    except Exception as e:
        print(f"Ek unexpected error pesh aya: {e}")

if __name__ == "__main__":
    filter_us_numbers()
