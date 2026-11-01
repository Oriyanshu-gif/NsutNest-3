/**
 * Checks the IMS My Profile parser against the real portal shapes.
 *
 * The summary fixture mirrors the live My Profile table: a `plum_head` tab row,
 * a `plum_fieldbig` photo row and `<th>label</th><td>value</td>` rows. The View
 * fixture mirrors the read-only form, including its spacer cells and the bank,
 * Aadhaar and parent fields that NSUT NEST must never surface.
 *
 * Run with:  npm run check:profile
 */
import {
  detectImageMimeType,
  findProfileViewUrl,
  isImsLoginPage,
  mergeProfileFields,
  parseProfileSummary,
  parseProfileView,
} from '../lib/ims-profile';

const SUMMARY_FIELDS: [string, string][] = [
  ['Student ID', '2025UME4077'],
  ['Student Name', 'PRIYANSHU KUMAR SINGH'],
  ['DOB', '12-07-2006'],
  ['Gender', 'MALE'],
  ['Category', 'OB'],
  ['Admission', 'JEE'],
  ['Branch Name', 'MECHANICAL ENGINEERING'],
  ['Degree', 'B.Tech.'],
  ['FT/PT', 'FULL TIME'],
  ['Specialization', 'MECHANICAL ENGINEERING'],
  ['Section', '2'],
];

const header = `
  <tr class="plum_head"><td colspan="2" style="padding:6px;">Student Profile&nbsp;&nbsp;
    <a target="data" class="printroundedborder plum_button" href="https://www.imsnsit.org/imsnsit/plum_url.php?view-token">&nbsp;View&nbsp;</a>
    <a target="top" class="printroundedborder plum_button" href="https://www.imsnsit.org/imsnsit/plum_url.php?update-token">&nbsp;Update Profile&nbsp;</a>
    <a target="top" class="printroundedborder plum_button" href="https://www.imsnsit.org/imsnsit/plum_url.php?sign-token">&nbsp;Upload Signature&nbsp;</a>
    <a target="new" class="printroundedborder plum_button" href="https://www.imsnsit.org/imsnsit/plum_url.php?print-token">&nbsp;Print Profile&nbsp;</a>
  </td></tr>`;

function summaryPage(fields: [string, string][], photo: string | null) {
  return `<html><body>
    <table width="100%"><tr><td>
      <img src="theme_grey/logo.png" width="100" height="100">
      <table cellspacing="0" cellpadding="0" width="60%" class="round shadow">
        <tbody>
          ${header}
          ${photo ? `<tr class="plum_fieldbig"><td colspan="2"><img class="round" src="${photo}" height="100" width="100"></td></tr>` : ''}
          <tr class="plum_fieldbig"><td colspan="2"><br></td></tr>
          ${fields.map(([label, value]) => `<tr class="plum_fieldbig"><th>${label}</th><td class="plum_field">${value}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </td></tr></table>
    <a href="https://www.imsnsit.org/imsnsit/notice.php">View</a>
  </body></html>`;
}

const VIEW_FIELDS: [string, string][] = [
  ['JEE Roll No', '250310047735'],
  ['Student ID', '2025UME4077'],
  ['Name', 'PRIYANSHU KUMAR SINGH'],
  ['DOB', '2006-07-12'],
  ['Gender', 'MALE'],
  ['Category', 'OB'],
  ['Sub Category', 'GN'],
  ['Minority', 'No'],
  ['Email', 'student@example.com'],
  ['Mobile', '9999999999'],
  ['Father Name', 'FATHER NAME'],
  ['Bank A/c No', '00000000000'],
  ['Aadhaar No', '111122223333'],
  ['PAN No (write NA, if not allotted)', 'ABCDE1234F'],
  ['Section', '2'],
];

function viewPage(fields: [string, string][]) {
  return `<html><body><table>
    ${fields.map(([label, value]) => `<tr><td></td><td>${label}</td><td>${value}</td><td></td></tr>`).join('\n')}
  </table></body></html>`;
}

const failures: string[] = [];
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

// 1. Real summary shape: photo row plus 11 label/value rows in portal order.
const summary = parseProfileSummary(summaryPage(SUMMARY_FIELDS, 'plum_url.php?photo-token'));
check('summary returns every profile field', summary.fields.map(field => field.label), SUMMARY_FIELDS.map(([label]) => label));
check('summary keeps the real values', summary.fields.map(field => field.value), SUMMARY_FIELDS.map(([, value]) => value));
check('photo row wins over the decorative logo', summary.photoSrc, 'plum_url.php?photo-token');

// 2. The View tab is the anchor in the table header, not the body link.
check('View tab resolves to the authenticated tab URL', findProfileViewUrl(summaryPage(SUMMARY_FIELDS, null), 'https://www.imsnsit.org/imsnsit/plum_url.php?my-profile'),
  'https://www.imsnsit.org/imsnsit/plum_url.php?view-token');

// 3. Read-only View form has spacer cells; only requested fields may pass.
const view = parseProfileView(viewPage(VIEW_FIELDS));
const viewLabels = view.fields.map(field => field.label);
check('View form labels are read from the middle cells', viewLabels,
  ['Student ID', 'Name', 'DOB', 'Gender', 'Category', 'Section']);
check('sensitive View fields never reach the profile', viewLabels.some(label => /email|mobile|father|bank|aadhaar|pan|jee/i.test(label)), false);

// 4. Merge fills a missing summary field but keeps the summary's own values.
const missingSection = SUMMARY_FIELDS.filter(([label]) => label !== 'Section');
const merged = mergeProfileFields(parseProfileSummary(summaryPage(missingSection, null)).fields, view.fields);
check('merge appends the missing Section from View', merged.find(field => field.label === 'Section')?.value, '2');
check('merge keeps the summary DOB format', merged.find(field => field.label === 'DOB')?.value, '12-07-2006');
check('merge preserves the requested order', merged.map(field => field.label),
  ['Student ID', 'Student Name', 'DOB', 'Gender', 'Category', 'Admission', 'Branch Name', 'Degree', 'FT/PT', 'Specialization', 'Section']);

// 5. Unavailable photograph and login-page detection.
check('no photo row gives no photo', parseProfileSummary(summaryPage(SUMMARY_FIELDS, null)).photoSrc, null);
check('IMS login form is detected', isImsLoginPage('<form><input type="password" name="pwd"></form>'), true);
check('profile page is not mistaken for a login page', isImsLoginPage(summaryPage(SUMMARY_FIELDS, null)), false);

// 6. Values are normalised without losing content.
const spaced = parseProfileSummary(summaryPage([['Student Name', '  PRIYANSHU   KUMAR SINGH  ']], null));
check('whitespace and non-breaking spaces are normalised', spaced.fields[0].value, 'PRIYANSHU KUMAR SINGH');

// 7. IMS serves the photograph as a JPEG with a text/html header, so the bytes
//    decide the format; an HTML error page must never pass as a photo.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
check('JPEG bytes labelled as HTML are recognised', detectImageMimeType(jpeg), 'image/jpeg');
check('PNG bytes are recognised',
  detectImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'image/png');
check('an HTML login page is not an image',
  detectImageMimeType(Buffer.from('<html><body>Please Login</body></html>')), null);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nAll IMS profile checks passed.');
