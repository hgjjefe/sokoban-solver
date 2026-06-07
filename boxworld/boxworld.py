#from pathlib import Path
#contents = Path('C:/Users/someone/Desktop/javascriptprogramming/sokoban-solver/boxworld/level_01.txt').read_text()

'''
for i in range(7,104):
    slevel = '0' + str(i) if i < 10 else str(i)
    filename = f'./level_{slevel}.txt'
    # 1. Read the current content
    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()

    # 2. Insert the extra newline after the first line
    updated_content = content.replace('-1', f'-{i}', 1)

    # 3. Overwrite the file with the updated content
    with open(filename, "w", encoding="utf-8") as f:
        f.write(updated_content)

    print(f"Successfully modified {filename} in place!")
'''

filename = './Boxworld.txt'
# 1. Open in READ mode ("r") to get the data
with open(filename, "r", encoding="utf-8") as f:
    content = f.read()

aggregate = ''

for i in range(1,101):
    slevel = '0' + str(i) if i < 10 else str(i)
    filename = f'./level_{slevel}.txt'
    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()
        aggregate += content

# 2. Open in WRITE mode ("w") to save the changes
with open('./Boxworld.txt', "w", encoding="utf-8") as f:
    f.write(aggregate)  # This works perfectly now