import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { RequiredDocuments } from './RequiredDocuments';
import type { BoxFolderItem } from '../lib/box';
const file = (id: string, documentType?: string): BoxFolderItem => ({id, name: `${id}.pdf`, type:'file', metadata:{enterprise:{losDocument:{documentType}}}});
test('one inventory keeps supporting files, duplicate types, signed outputs and missing requirements', () => {
 const files = [file('appraisal','Appraisal'),file('updated-appraisal','Appraisal'),file('letter','Signed Commitment Letter'),file('log','Signing Log'),file('new-upload')];
 const preview=vi.fn();
 render(<RequiredDocuments includeAllFiles loanType="Commercial Real Estate" files={files} canUpload onUpload={()=>{}} onPreview={preview}/>);
 expect(screen.getAllByRole('table')).toHaveLength(1);
 for(const f of files)expect(screen.getAllByRole('button',{name:f.name})).toHaveLength(1);
 expect(screen.getAllByText('Missing')).toHaveLength(5);
 expect(screen.getByText('1 of 6 received.')).toBeVisible();
 expect(screen.getByText('Signed')).toBeVisible();
 expect(screen.getByText('Completed')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'letter.pdf'}));
 expect(preview).toHaveBeenCalledWith(files[2]);
});
test('unknown loan types still show their documents',()=>{
 render(<RequiredDocuments includeAllFiles files={[file('letter','Signed Commitment Letter')]} canUpload onUpload={()=>{}}/>);
 expect(screen.getByRole('button',{name:'letter.pdf'})).toBeVisible();
});
