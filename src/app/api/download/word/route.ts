import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { title, markdown } = await request.json();

        // Dynamic import to avoid build-time type issues
        const docx = await import('docx');
        const {
            Document,
            Packer,
            Paragraph,
            TextRun,
            HeadingLevel,
            AlignmentType,
            Table,
            TableRow,
            TableCell,
            WidthType,
            BorderStyle,
        } = docx;

        // Parse frontmatter out
        let content = markdown;
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (fmMatch) {
            content = content.slice(fmMatch[0].length);
        }

        const lines: string[] = content.split('\n');
        const children: any[] = [];

        // Title
        children.push(
            new Paragraph({
                text: title,
                heading: HeadingLevel.TITLE,
                spacing: { after: 300 },
            })
        );

        // Parse inline bold/italic
        function parseInline(text: string): any[] {
            const runs: any[] = [];
            const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\))/g;
            let lastIndex = 0;
            let match;

            while ((match = pattern.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
                }
                if (match[2]) {
                    runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
                } else if (match[3]) {
                    runs.push(new TextRun({ text: match[3], bold: true }));
                } else if (match[4]) {
                    runs.push(new TextRun({ text: match[4], italics: true }));
                } else if (match[5] && match[6]) {
                    runs.push(new TextRun({ text: `${match[5]} (${match[6]})`, color: '0066CC' }));
                }
                lastIndex = pattern.lastIndex;
            }

            if (lastIndex < text.length) {
                runs.push(new TextRun({ text: text.slice(lastIndex) }));
            }
            if (runs.length === 0) {
                runs.push(new TextRun({ text }));
            }
            return runs;
        }

        // Parse markdown table
        function makeTable(tableLines: string[]): any {
            if (tableLines.length < 3) return null;

            const parseRow = (row: string): string[] =>
                row.split('|').slice(1, -1).map((cell) => cell.trim());

            const headers = parseRow(tableLines[0]);
            const dataRows = tableLines.slice(2).map(parseRow);

            const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
            const borders = { top: border, bottom: border, left: border, right: border };
            const colWidth = Math.floor(9000 / Math.max(headers.length, 1));

            const headerRow = new TableRow({
                children: headers.map(
                    (h) =>
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                            borders,
                            shading: { fill: 'F0E8E0', type: 'clear' as any, color: 'auto' },
                            width: { size: colWidth, type: WidthType.DXA },
                        })
                ),
            });

            const bodyRows = dataRows.map(
                (row) =>
                    new TableRow({
                        children: headers.map(
                            (_, ci) =>
                                new TableCell({
                                    children: [new Paragraph({ text: row[ci] || '' })],
                                    borders,
                                    width: { size: colWidth, type: WidthType.DXA },
                                })
                        ),
                    })
            );

            return new Table({
                rows: [headerRow, ...bodyRows],
                width: { size: 9000, type: WidthType.DXA },
            });
        }

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            // Table block
            if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test((lines[i + 1] || '').trim())) {
                const tableLines: string[] = [];
                while (i < lines.length && lines[i].startsWith('|')) {
                    tableLines.push(lines[i]);
                    i++;
                }
                const table = makeTable(tableLines);
                if (table) children.push(table);
                continue;
            }

            // H1
            if (line.startsWith('# ') && !line.startsWith('## ')) {
                children.push(new Paragraph({
                    text: line.replace(/^# /, ''),
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 },
                }));
                i++;
                continue;
            }

            // H2
            if (line.startsWith('## ')) {
                children.push(new Paragraph({
                    text: line.replace(/^## /, ''),
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 350, after: 180 },
                }));
                i++;
                continue;
            }

            // H3
            if (line.startsWith('### ')) {
                children.push(new Paragraph({
                    text: line.replace(/^### /, ''),
                    heading: HeadingLevel.HEADING_3,
                    spacing: { before: 250, after: 150 },
                }));
                i++;
                continue;
            }

            // Blockquote
            if (line.startsWith('> ')) {
                children.push(new Paragraph({
                    children: parseInline(line.replace(/^> /, '')),
                    indent: { left: 720 },
                    spacing: { before: 100, after: 100 },
                }));
                i++;
                continue;
            }

            // List item
            if (line.startsWith('- ')) {
                children.push(new Paragraph({
                    children: parseInline(line.replace(/^- /, '')),
                    bullet: { level: 0 },
                    spacing: { before: 50, after: 50 },
                }));
                i++;
                continue;
            }

            // Image → placeholder text
            if (line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)) {
                const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
                if (imgMatch && imgMatch[1]) {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: `[圖片: ${imgMatch[1]}]`, italics: true, color: '888888' })],
                        spacing: { before: 100, after: 100 },
                        alignment: AlignmentType.CENTER,
                    }));
                }
                i++;
                continue;
            }

            // HR
            if (line.trim() === '---') {
                children.push(new Paragraph({
                    text: '',
                    spacing: { before: 200, after: 200 },
                }));
                i++;
                continue;
            }

            // Empty line
            if (line.trim() === '') {
                i++;
                continue;
            }

            // Regular paragraph
            children.push(new Paragraph({
                children: parseInline(line),
                spacing: { before: 80, after: 80 },
            }));
            i++;
        }

        const doc = new Document({
            sections: [{
                properties: {},
                children,
            }],
        });

        const buffer = await Packer.toBuffer(doc);

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.docx"`,
            },
        });
    } catch (err: any) {
        console.error('Word conversion error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}