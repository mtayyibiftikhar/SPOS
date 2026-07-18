from __future__ import annotations

import os
from pathlib import Path

from PIL import Image as PILImage, ImageDraw, ImageFilter, ImageOps
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "tmp" / "pdfs" / "pos_user_manual" / "screenshots"
PREPARED_DIR = ROOT / "tmp" / "pdfs" / "pos_user_manual" / "prepared"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT_PATH = OUTPUT_DIR / "Simple_POS_Store_User_Manual.pdf"

PAGE_W, PAGE_H = A4

NAVY = colors.HexColor("#0F172A")
INK = colors.HexColor("#14213D")
MUTED = colors.HexColor("#53627A")
GREEN = colors.HexColor("#059669")
GREEN_DARK = colors.HexColor("#047857")
GREEN_SOFT = colors.HexColor("#E9FBF4")
MINT = colors.HexColor("#D9F7EC")
BLUE_SOFT = colors.HexColor("#EEF5FF")
AMBER = colors.HexColor("#D97706")
AMBER_SOFT = colors.HexColor("#FFF5D9")
RED = colors.HexColor("#DC2626")
RED_SOFT = colors.HexColor("#FFF0F0")
PURPLE = colors.HexColor("#6D5CE7")
PURPLE_SOFT = colors.HexColor("#F2EFFF")
PAPER = colors.HexColor("#FBFCFA")
LINE = colors.HexColor("#D9E2EC")
WHITE = colors.white


def register_fonts() -> tuple[str, str, str]:
    candidates = [
        (Path(r"C:\Windows\Fonts\segoeui.ttf"), Path(r"C:\Windows\Fonts\segoeuib.ttf"), Path(r"C:\Windows\Fonts\segoeuisb.ttf")),
        (Path(r"C:\Windows\Fonts\arial.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")),
    ]
    for regular, bold, semibold in candidates:
        if regular.exists() and bold.exists() and semibold.exists():
            pdfmetrics.registerFont(TTFont("POSRegular", str(regular)))
            pdfmetrics.registerFont(TTFont("POSBold", str(bold)))
            pdfmetrics.registerFont(TTFont("POSSemi", str(semibold)))
            return "POSRegular", "POSBold", "POSSemi"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Bold"


FONT_REGULAR, FONT_BOLD, FONT_SEMI = register_fonts()


class ManualDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=16 * mm,
            rightMargin=16 * mm,
            topMargin=18 * mm,
            bottomMargin=17 * mm,
            title="Simple POS Store User Manual",
            author="Simple POS KSA",
            subject="Store operations and user training manual",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="cover", frames=[frame], onPage=draw_cover_page),
                PageTemplate(id="content", frames=[frame], onPage=draw_content_page),
            ]
        )

    def afterFlowable(self, flowable):
        section_title = getattr(flowable, "_toc_title", None)
        if section_title:
            key = f"section-{self.page}-{abs(hash((section_title, self.page)))}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(section_title, key, level=0, closed=False)
            self.notify("TOCEntry", (0, section_title, self.page, key))
            return

        style_name = getattr(getattr(flowable, "style", None), "name", "")
        if style_name == "ManualHeading1":
            level = 0
            text = flowable.getPlainText()
            key = f"heading-{self.page}-{abs(hash((text, self.page)))}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            self.notify("TOCEntry", (level, text, self.page, key))


def draw_cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#F1F7F5"))
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#D9F7EC"))
    canvas.circle(PAGE_W - 22 * mm, PAGE_H - 20 * mm, 38 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#EEEAFE"))
    canvas.circle(10 * mm, 22 * mm, 44 * mm, fill=1, stroke=0)
    canvas.restoreState()


def draw_content_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 12 * mm, PAGE_W - doc.rightMargin, 12 * mm)
    canvas.setFont(FONT_REGULAR, 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 7.5 * mm, "Simple POS KSA | Store Operations Manual")
    canvas.drawRightString(PAGE_W - doc.rightMargin, 7.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverKicker",
        fontName=FONT_SEMI,
        fontSize=10,
        leading=12,
        textColor=GREEN_DARK,
        spaceAfter=8,
        tracking=1.8,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        fontName=FONT_BOLD,
        fontSize=34,
        leading=38,
        textColor=NAVY,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubtitle",
        fontName=FONT_REGULAR,
        fontSize=13,
        leading=18,
        textColor=MUTED,
        spaceAfter=12,
    )
)
styles.add(
    ParagraphStyle(
        name="ManualHeading1",
        fontName=FONT_BOLD,
        fontSize=22,
        leading=26,
        textColor=NAVY,
        spaceBefore=4,
        spaceAfter=10,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="ManualHeading2",
        fontName=FONT_SEMI,
        fontSize=14,
        leading=17,
        textColor=INK,
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyPOS",
        fontName=FONT_REGULAR,
        fontSize=9.2,
        leading=13,
        textColor=INK,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="BodySmallPOS",
        fontName=FONT_REGULAR,
        fontSize=8,
        leading=11,
        textColor=MUTED,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="LabelPOS",
        fontName=FONT_SEMI,
        fontSize=7.5,
        leading=9,
        textColor=GREEN_DARK,
        spaceAfter=4,
        tracking=1.2,
    )
)
styles.add(
    ParagraphStyle(
        name="CaptionPOS",
        fontName=FONT_REGULAR,
        fontSize=7.7,
        leading=10,
        alignment=TA_CENTER,
        textColor=MUTED,
        spaceBefore=5,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="TOCHeading",
        fontName=FONT_SEMI,
        fontSize=10,
        leading=13,
        textColor=INK,
        leftIndent=0,
        firstLineIndent=0,
        spaceBefore=3,
    )
)


def P(text: str, style: str = "BodyPOS") -> Paragraph:
    return Paragraph(text, styles[style])


def H1(text: str) -> Paragraph:
    return Paragraph(text, styles["ManualHeading1"])


def H2(text: str) -> Paragraph:
    return Paragraph(text, styles["ManualHeading2"])


def bullets(items: list[str], level: int = 0) -> ListFlowable:
    return ListFlowable(
        [ListItem(P(item), leftIndent=12) for item in items],
        bulletType="bullet",
        start="circle" if level else "disc",
        leftIndent=18 + level * 8,
        bulletFontName=FONT_REGULAR,
        bulletFontSize=6,
        bulletColor=GREEN_DARK,
        spaceAfter=7,
    )


def steps(items: list[str]) -> Table:
    rows = []
    for index, item in enumerate(items, 1):
        rows.append(
            [
                Paragraph(str(index), ParagraphStyle(name=f"StepNo{index}", fontName=FONT_BOLD, fontSize=10, textColor=WHITE, alignment=TA_CENTER)),
                P(item),
            ]
        )
    table = Table(rows, colWidths=[9 * mm, 160 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), GREEN),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (0, -1), 2),
                ("RIGHTPADDING", (0, 0), (0, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (1, 0), (1, -1), 8),
                ("LINEBELOW", (1, 0), (1, -2), 0.35, LINE),
            ]
        )
    )
    return table


def callout(title: str, text: str, kind: str = "info") -> Table:
    palette = {
        "info": (BLUE_SOFT, colors.HexColor("#2563EB")),
        "success": (GREEN_SOFT, GREEN_DARK),
        "warning": (AMBER_SOFT, AMBER),
        "danger": (RED_SOFT, RED),
        "purple": (PURPLE_SOFT, PURPLE),
    }
    background, accent = palette[kind]
    content = [
        P(title.upper(), "LabelPOS"),
        P(text),
    ]
    table = Table([["", content]], colWidths=[3 * mm, 166 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BACKGROUND", (0, 0), (0, 0), accent),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 10),
                ("RIGHTPADDING", (1, 0), (1, 0), 10),
                ("TOPPADDING", (1, 0), (1, 0), 8),
                ("BOTTOMPADDING", (1, 0), (1, 0), 7),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.Color(accent.red, accent.green, accent.blue, alpha=0.22)),
            ]
        )
    )
    return table


def data_table(headers: list[str], rows: list[list[str]], widths: list[float] | None = None) -> Table:
    table_rows = [[P(h, "LabelPOS") for h in headers]]
    for row in rows:
        table_rows.append([P(cell, "BodySmallPOS") for cell in row])
    if widths is None:
        widths = [169 * mm / len(headers)] * len(headers)
    table = Table(table_rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def prepare_screenshot(source_name: str) -> Path | None:
    source = ASSET_DIR / source_name
    if not source.exists():
        return None
    PREPARED_DIR.mkdir(parents=True, exist_ok=True)
    target = PREPARED_DIR / source_name
    image = PILImage.open(source).convert("RGB")
    max_w, max_h = 1500, 1000
    contained = ImageOps.contain(image, (max_w, max_h), PILImage.Resampling.LANCZOS)
    canvas = PILImage.new("RGBA", (max_w + 70, max_h + 70), (0, 0, 0, 0))
    x = (canvas.width - contained.width) // 2
    y = (canvas.height - contained.height) // 2
    mask = PILImage.new("L", contained.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, contained.width, contained.height), radius=28, fill=255)
    shadow = PILImage.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_shape = PILImage.new("L", canvas.size, 0)
    shadow_draw = ImageDraw.Draw(shadow_shape)
    shadow_draw.rounded_rectangle((x + 8, y + 12, x + contained.width + 8, y + contained.height + 12), radius=30, fill=110)
    shadow_shape = shadow_shape.filter(ImageFilter.GaussianBlur(18))
    shadow.paste((24, 39, 58, 85), (0, 0), shadow_shape)
    canvas.alpha_composite(shadow)
    canvas.paste(contained.convert("RGBA"), (x, y), mask)
    border = ImageDraw.Draw(canvas)
    border.rounded_rectangle((x, y, x + contained.width - 1, y + contained.height - 1), radius=28, outline=(210, 224, 232, 255), width=3)
    final = PILImage.new("RGB", canvas.size, "white")
    final.paste(canvas, mask=canvas.getchannel("A"))
    final.save(target, quality=91, optimize=True)
    return target


def screenshot(source_name: str, caption: str, max_height: float = 4.95 * inch):
    prepared = prepare_screenshot(source_name)
    if prepared is None:
        return callout("Screenshot unavailable", f"The training screenshot {source_name} was not available during generation.", "warning")
    with PILImage.open(prepared) as image:
        width_px, height_px = image.size
    max_width = 6.55 * inch
    scale = min(max_width / width_px, max_height / height_px)
    display = Image(str(prepared), width=width_px * scale, height=height_px * scale)
    return KeepTogether([display, P(caption, "CaptionPOS")])


def section_banner(number: str, title: str, subtitle: str) -> Table:
    number_style = ParagraphStyle(name=f"SectionNo{number}", fontName=FONT_BOLD, fontSize=16, textColor=WHITE, alignment=TA_CENTER)
    table = Table(
        [[Paragraph(number, number_style), [H1(title), P(subtitle)]]],
        colWidths=[17 * mm, 152 * mm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), GREEN),
                ("BACKGROUND", (1, 0), (1, 0), GREEN_SOFT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 12),
                ("RIGHTPADDING", (1, 0), (1, 0), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#B8EBD7")),
            ]
        )
    )
    table._toc_title = f"{number}. {title}"
    return table


def add_page(story: list, number: str, title: str, subtitle: str):
    story.extend([PageBreak(), section_banner(number, title, subtitle), Spacer(1, 7)])


def build_story() -> list:
    story: list = []

    story.extend(
        [
            NextPageTemplate("cover"),
            Spacer(1, 18 * mm),
            P("SIMPLE POS KSA", "CoverKicker"),
            P("Store POS<br/>User Manual", "CoverTitle"),
            P("A complete operating guide for shop admins, cashiers, managers, and authorized staff.", "CoverSubtitle"),
            Spacer(1, 4 * mm),
            callout(
                "Purpose",
                "Use this handbook to activate the POS, open the business day, manage products and stock, create sales, collect account balances, issue refunds, export reports, and close the register correctly.",
                "success",
            ),
            Spacer(1, 8 * mm),
            screenshot("01_staff_login.png", "Training shop shown for illustration. Your shop name, logo, users, and contact details will be different.", max_height=3.5 * inch),
            Spacer(1, 6 * mm),
            data_table(
                ["VERSION", "RELEASE", "SCOPE"],
                [["1.0", "July 2026", "Store POS only - owner portal excluded"]],
                [35 * mm, 45 * mm, 89 * mm],
            ),
            PageBreak(),
            NextPageTemplate("content"),
            H1("How to use this manual"),
            P("Follow the opening, selling, and closing chapters in order during training. Use the module chapters later as desk references."),
            callout(
                "Before training",
                "Use a training shop or test products whenever possible. Never practice refunds, permanent deletion, password changes, or data import on a live store unless the admin has approved it.",
                "warning",
            ),
            H2("Symbols and wording"),
            data_table(
                ["TERM", "MEANING"],
                [
                    ["Admin only", "The action requires a shop admin or a role with that explicit permission."],
                    ["Saved", "The change has been accepted by the POS. Wait for this state before leaving the page."],
                    ["Business day", "The store-wide operating date shared by all devices."],
                    ["Shift", "One cashier register session inside the open business day."],
                    ["Account / Pay later", "A sale saved as money owed by a named customer."],
                ],
                [42 * mm, 127 * mm],
            ),
            H2("Table of contents"),
        ]
    )
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="TOCLevel1", fontName=FONT_SEMI, fontSize=9.6, leading=14, textColor=INK, leftIndent=0, firstLineIndent=0, spaceBefore=4),
        ParagraphStyle(name="TOCLevel2", fontName=FONT_REGULAR, fontSize=8.5, leading=12, textColor=MUTED, leftIndent=12, firstLineIndent=0),
    ]
    story.extend([toc, PageBreak()])

    story.extend(
        [
            H1("Quick start: the correct daily sequence"),
            P("A sale is allowed only when the business day and the current user's shift are open. Attendance may also be required by the shop policy."),
            steps(
                [
                    "Open the store POS and sign in with your assigned user and password.",
                    "Clock in when the attendance gate appears. Capture location and selfie, or use admin bypass only when authorized.",
                    "Open the business day from Dashboard > Day control if it is not already open.",
                    "Open your shift from Dashboard > Shift control and enter the actual opening cash in the drawer.",
                    "Confirm that Dashboard shows Day open and your shift is counted as open.",
                    "Create sales from Billing. Use named customers for Account / Pay later transactions.",
                    "At shift end, count the drawer, enter counted cash, review the difference, and close the shift.",
                    "The last authorized admin closes the business day after every shift is closed.",
                ]
            ),
            Spacer(1, 8),
            callout(
                "Cash formula",
                "Expected cash = Opening cash + Cash sales + Cash in - Cash out - Cash refunds. Expenses paid in cash also reduce the drawer through the expense logic.",
                "purple",
            ),
            H2("Who should use which areas"),
            data_table(
                ["ROLE", "NORMAL RESPONSIBILITIES", "RESTRICTED ACTIONS"],
                [
                    ["Shop admin", "Setup, users, products, inventory, refunds, reports, day close, backups.", "Permanent deletion and sensitive settings still require care."],
                    ["Manager", "Daily operations, staff supervision, stock, reports, approved refunds.", "Only permissions assigned to the role are available."],
                    ["Cashier", "Clock in, open own shift, bill customers, print/share receipts, close own shift.", "No refunds, permanent deletion, user administration, or sensitive imports unless granted."],
                ],
                [29 * mm, 72 * mm, 68 * mm],
            ),
        ]
    )

    add_page(story, "01", "Activation and first sign-in", "Connect the device to the correct shop, create the first admin once, and use normal staff sign-in afterward.")
    story.extend(
        [
            H2("First device activation"),
            steps(
                [
                    "Obtain the 30+ character activation key from the POS company or store owner.",
                    "Open the POS activation screen and paste the complete key. Do not type spaces before or after it.",
                    "Verify the key. The POS downloads the store name, license, device limit, and owner-prepared setup details.",
                    "Complete first-time setup only when the store has no admin yet: confirm shop details, VAT and receipt information, and create the first admin user.",
                    "After setup, return to the normal staff sign-in screen. The setup wizard should not appear again unless the store is logged out from that device.",
                ]
            ),
            callout("Device limit", "Activation and shift limits are controlled by the POS owner. If the device limit is reached, remove an unused device or request a higher limit before activating another device.", "warning"),
            H2("Normal staff sign-in"),
            screenshot("01_staff_login.png", "Select your registered user, enter your own password, and sign in. Never share credentials between staff.", max_height=2.85 * inch),
            bullets(
                [
                    "Confirm the store name and address before signing in. Passwords must be at least eight characters and are never displayed to other users.",
                    "Use Log out this store only when intentionally removing the activation from that device. Locked, expired, revoked, or trial-ended shops instead show a clear status screen with POS owner contact details.",
                ]
            ),
        ]
    )

    add_page(story, "02", "Attendance and time clock", "Record daily attendance separately from the cashier shift, with location and selfie verification when enabled.")
    story.extend(
        [
            screenshot("03_time_clock_gate.png", "The attendance gate appears after sign-in when the business day is open and today's clock-in is missing."),
            H2("Clock in"),
            steps(
                [
                    "Confirm your name and business date on the gate.",
                    "Scan the displayed QR from your phone when directed, or continue on the current device.",
                    "Allow location access and capture the current location.",
                    "Take a clear selfie using the camera. Use a recent live image; do not upload another person's photo.",
                    "Tap Clock in and enter POS. The clock-in is recorded for that employee and date.",
                ]
            ),
            callout("Admin bypass", "Admin bypass is an exception for operational recovery. It should not replace normal attendance. Any manual clock-in, clock-out, or time correction must include an admin review.", "warning"),
            H2("Clock out and salary hours"),
            bullets(
                [
                    "Clock out from the Time Clock module when work ends, even if the cashier shift was already closed.",
                    "Attendance hours and register shift hours are different records. A person may work before or after operating the drawer.",
                    "If clock-out is forgotten, the system may use the configured default daily hours. An admin can correct the time card later.",
                    "Salary calculations use approved attendance hours and the employee pay settings. Verify edited time cards before payroll export.",
                ]
            ),
        ]
    )

    add_page(story, "03", "Dashboard and cash control", "Open and close the store-wide business day, manage shifts, record expenses, and understand register totals.")
    story.extend(
        [
            screenshot("04_dashboard_live.png", "Dashboard overview after the business day and one cashier shift are open."),
            H2("Dashboard overview"),
            data_table(
                ["CARD / FIELD", "WHAT IT MEANS"],
                [
                    ["Today's sales", "Net sales for the current business date after refunds."],
                    ["This week / month", "Net sales for the selected calendar period."],
                    ["Monthly profit", "Sales profit after product cost, refunds, and recorded expenses."],
                    ["Open shifts", "Active register sessions compared with the allowed device/shift limit."],
                    ["Day bills", "Bills created during the current business day across all shifts."],
                    ["Expected cash", "The amount that should physically be in all relevant drawers based on recorded cash activity."],
                    ["Inventory pulse", "Current stock value, units, active products, and low-stock count."],
                ],
                [49 * mm, 120 * mm],
            ),
            H2("Open the business day"),
            steps(
                [
                    "Go to Dashboard > Day control.",
                    "Confirm the business date. Normally it is today's date.",
                    "Add an optional opening note and select Start day.",
                    "Only one business day may be open for a shop at a time, even when several devices are used.",
                ]
            ),
            H2("Open your shift"),
            steps(
                [
                    "Go to Dashboard > Shift control after the day is open.",
                    "Count the cash already in your drawer and enter Opening cash.",
                    "Select Start shift. Billing becomes available for that user/device.",
                ]
            ),
            callout("Multiple devices", "A store may have several open shifts inside one business day, up to the configured device limit. If every slot is used, an admin can review active shifts and force-close the correct stale shift before opening another.", "info"),
            H2("Expenses and drawer adjustments"),
            data_table(
                ["ACTION", "USE IT FOR", "DO NOT USE IT FOR"],
                [
                    ["Expense", "Rent, utilities, petty cash purchases, vendor expense payments.", "A normal product purchase order or customer refund."],
                    ["Cash in", "Extra float or owner cash added to the drawer outside a sale.", "Cash received for a customer sale or account settlement."],
                    ["Cash out", "Owner withdrawal or drawer correction outside sales/refunds/expenses.", "An expense that should appear in profit/loss."],
                ],
                [35 * mm, 67 * mm, 67 * mm],
            ),
        ]
    )

    add_page(story, "04", "Products, services, and categories", "Build the item catalog with multilingual names, prices, tax rules, images, barcodes, and quick-billing visibility.")
    story.extend(
        [
            screenshot("05_product_editor.png", "Product editor with multilingual names, type, category, prices, barcodes, stock controls, image, tax, and quick-tab settings."),
            H2("Create a category"),
            bullets(
                [
                    "Open Products > Categories, then choose Create category.",
                    "Category names are case-insensitive. Milk, MILK, and milk are treated as the same name.",
                    "Add an optional image. The image appears on the Billing quick-tab category tile.",
                    "Edit or delete a category from Category list. Reassign products before deleting a category that is still in use.",
                ]
            ),
            H2("Create a product or service"),
            steps(
                [
                    "Open Products > Product editor and enter English, Arabic, and Urdu names as available.",
                    "Choose Product for stock-controlled goods or Service for non-stock work.",
                    "Select a category. Use + Add new category when the required category does not exist.",
                    "Enter sale price and cost price. Cost price drives profit calculations; keep it current.",
                    "Assign the generated barcode, scan an existing barcode, or add extra unique barcodes for the same item.",
                    "For products, enter opening stock and reorder level. Services do not use stock quantity.",
                    "Upload an optimized product image and choose whether the item appears in the Billing quick tab.",
                    "Confirm Apply shop tax for taxable items, then save.",
                ]
            ),
            callout("Barcode safety", "Every barcode must be unique inside the shop. The Assigned barcodes window lists all codes for the product. A barcode can be deleted only when at least one valid barcode remains.", "success"),
            H2("Product list, quick billing, and labels"),
            bullets(
                [
                    "Product list supports search, category filtering, editing, deactivation, and deletion to Product Trash.",
                    "Quick billing shows only items marked for fast checkout. Search and remove items without editing the full product.",
                    "Print barcode labels for one product, selected products, or the full list. Choose the required sticker dimensions, rows, columns, and which assigned barcode to print.",
                    "Deleted products do not disappear permanently. Restore them from Settings > Product Trash unless an admin intentionally deletes forever.",
                ]
            ),
        ]
    )

    add_page(story, "05", "Inventory, suppliers, and purchase orders", "Receive stock, adjust inventory with an audit trail, manage suppliers, and complete purchase orders accurately.")
    story.extend(
        [
            screenshot("08_inventory.png", "Inventory overview with stock totals, low-stock shortcut, supplier count, search, filters, pagination, and PDF export."),
            H2("Inventory overview"),
            bullets(
                [
                    "Only physical products appear in inventory. Services are excluded.",
                    "Filter by product name/barcode, category, or supplier. Use pagination for large catalogs.",
                    "Select Download PDF for a structured inventory record with shop branding and current filters.",
                    "Select Low stock to prepare a purchase order from products at or below their reorder level.",
                ]
            ),
            H2("Add inventory"),
            steps(
                [
                    "Open Inventory > Add inventory.",
                    "Scan a barcode or search the product name. Services are rejected because they cannot be stocked.",
                    "Add each product to the receiving list and enter quantity, supplier, and current unit cost.",
                    "Review the list. Updated cost price affects future profit calculations; it does not rewrite old bill profit.",
                    "Use Hold when receiving must pause. Up to two receiving sessions can be held locally and restored later.",
                    "Confirm receiving only after quantities and costs match the supplier document.",
                ]
            ),
            callout("Supplier rule", "Use one supplier per purchase order. Direct stock receiving may include products from several suppliers only when each line is assigned correctly. For clean purchasing records, prefer separate receiving sessions per supplier.", "info"),
            H2("Inventory adjustment"),
            data_table(
                ["MODE", "BEST USE"],
                [
                    ["By item", "Correct one or more selected products after a count, damage, or data correction."],
                    ["By supplier", "Review all products normally purchased from one supplier."],
                    ["By category", "Perform a structured count for one department or shelf group."],
                ],
                [45 * mm, 124 * mm],
            ),
            P("Adjustments create movement records. Use the real counted quantity and a meaningful reason when required; do not use adjustment to hide a sale, refund, or supplier receipt."),
            H2("Suppliers"),
            bullets(
                [
                    "Store supplier name, phone, email, address, VAT number, payment terms, and opening balance where applicable.",
                    "Supplier detail shows purchased items, order value, paid amount, open balance, and purchase order history.",
                    "Use supplier credit only when the business will track payments consistently.",
                ]
            ),
            H2("Purchase order workflow"),
            steps(
                [
                    "Open Inventory > Order inventory and search/scan products, or load low-stock products.",
                    "Set order quantity and expected unit cost for each line.",
                    "Continue to Supplier, select one supplier, and add expected date, PO number, payment status, and notes.",
                    "Amount paid cannot exceed the purchase order total.",
                    "Create and print the PO. It remains Open until receiving is confirmed.",
                    "From PO history, open the order, verify actual received quantities and final cost, then Complete to restock inventory or Cancel when nothing is received.",
                    "Use Reorder to copy a previous PO, then edit items, quantities, costs, and dates before creating a new order.",
                ]
            ),
        ]
    )

    add_page(story, "06", "Billing and checkout", "Use the fast two-panel register, hold unfinished carts, identify customers, apply controlled discounts, and take payment.")
    story.extend(
        [
            screenshot("06_billing_workspace.png", "Billing is available only while the day and the current cashier shift are open."),
            H2("Add items"),
            bullets(
                [
                    "Use the quick tab to open a category and tap products, or scan/search from the cart side.",
                    "Barcode scanning should place the exact matching product into the cart. Multiple scans increase quantity.",
                    "Change quantity with + / -, enter an authorized selling price, apply an item discount when permitted, or remove the line.",
                    "The total area updates immediately. Discounts cannot be negative or greater than the line/bill value; percentage discounts cannot exceed 100 percent.",
                ]
            ),
            H2("Hold an unfinished order"),
            steps(
                [
                    "Select Hold order when the customer needs more time.",
                    "Identify the order with the available customer/name or note so staff can recognize it.",
                    "The current cart clears and a new sale can begin.",
                    "Open Held bills, select the correct order, and Restore. Up to two held orders are stored locally on that device.",
                    "Held orders are not completed sales and do not affect reports or inventory until checkout.",
                ]
            ),
            H2("Customer and discount step"),
            bullets(
                [
                    "Walk-in Customer is allowed for Cash and Card payments.",
                    "Search an existing customer by name or phone, or add a new customer with the correct country code.",
                    "Account / Pay later requires a saved named customer. Walk-in account sales are blocked.",
                    "Apply an authorized whole-bill fixed or percentage discount on the customer step. Item discounts remain attached to their lines.",
                    "Automatic promotions configured in Settings appear according to their dates and eligible bill/product/service scope.",
                ]
            ),
            H2("Payment step"),
            data_table(
                ["METHOD", "RESULT"],
                [
                    ["Cash", "Paid sale; included in expected drawer cash."],
                    ["Card", "Paid sale; recorded in card breakdown and not added to drawer cash."],
                    ["Account / Pay later", "Creates an amount due against the selected customer's account bill."],
                ],
                [44 * mm, 125 * mm],
            ),
            callout("Before Create bill", "Confirm customer, item quantities, selling prices, discounts, VAT, payment method, paid amount, and due amount. Bills are never permanently deleted as a normal correction; use the Refund module when a completed sale must be reversed.", "warning"),
        ]
    )

    add_page(story, "07", "Receipts, printing, and sharing", "Print thermal or A4 receipts, download PDF, share a digital verification link, and show bilingual product names when required.")
    story.extend(
        [
            H2("After a successful sale"),
            steps(
                [
                    "The POS opens the receipt page and saves the bill before printing/sharing actions are used.",
                    "If auto print is enabled, the browser print dialog opens automatically. The receipt page remains visible briefly, then returns to Billing.",
                    "Use Print for the configured 58mm, 80mm, or A4 layout.",
                    "Use Download PDF for a branded receipt file.",
                    "Use Share PDF when the device supports file sharing. Otherwise use Email or WhatsApp to send the prepared purchase message and digital receipt link.",
                ]
            ),
            H2("Digital receipt verification"),
            bullets(
                [
                    "Every receipt has a unique public verification URL and QR code.",
                    "Scanning the QR opens that exact store receipt online. It does not expose other bills.",
                    "WhatsApp and email messages include the customer name where available, store name, receipt number, purchased items, total, and the digital receipt link.",
                    "The browser cannot silently attach a PDF to WhatsApp Web or a normal mail client. The verification link removes the need for manual attachment in most cases.",
                ]
            ),
            H2("Receipt content checklist"),
            data_table(
                ["HEADER", "SALE", "TOTALS / FOOTER"],
                [
                    ["Logo, shop name, address, phone, VAT number", "Receipt number, date/time, cashier, customer, item, quantity, price", "Subtotal, discounts, VAT, total, paid, due, payment method, QR, footer"],
                ],
                [56 * mm, 62 * mm, 51 * mm],
            ),
            callout("Second language", "Enable a secondary receipt language in Receipt settings and choose Arabic or Urdu. Product names then appear in English plus the selected language on the on-screen receipt, print output, PDF, WhatsApp, and email receipt content.", "success"),
            H2("Printer troubleshooting"),
            bullets(
                [
                    "Confirm the printer is installed in the operating system and selected in the browser print dialog.",
                    "Set paper size to match Printer settings and disable browser headers/footers when they interfere.",
                    "Use 100 percent scale for thermal printing unless the hardware requires a documented adjustment.",
                    "For installed desktop/mobile wrappers, ensure print/download permissions are allowed by the operating system.",
                ]
            ),
        ]
    )

    add_page(story, "08", "Bills and customer accounts", "Find receipts, print selections, maintain customer records, collect specific account bills, and issue statements.")
    story.extend(
        [
            screenshot("09_bills.png", "Bills supports date presets, detailed search, refunded-bill view, pagination, and batch printing."),
            H2("Bills module"),
            bullets(
                [
                    "Filter Today, Yesterday, This week, This month, This year, or Custom dates.",
                    "Search by receipt number, customer, phone, email, or date.",
                    "Open a bill to view the receipt, reprint, download PDF, or send the digital receipt link.",
                    "Use Sales receipts or Refunded bills to separate normal sales from return activity.",
                    "Select individual receipts, the visible page, the current period, or all eligible bills for batch printing.",
                ]
            ),
            screenshot("07_customers.png", "Customer overview shows saved customers, balances, total outstanding amount, and recorded settlements."),
            H2("Customer directory"),
            bullets(
                [
                    "Phone number is the unique customer identifier. Two customers cannot use the same normalized number.",
                    "Use the correct country code. For +966, enter the local number without its leading zero.",
                    "Edit customer contact details from the customer profile. Removing a customer with financial history may be restricted.",
                    "Export customers for backup. For import, download the approved spreadsheet template and keep its exact columns.",
                    "During import, invalid rows are rejected and duplicate phone numbers are skipped or presented for review.",
                ]
            ),
            H2("Account / Pay later collection"),
            steps(
                [
                    "Open Customers > Account overview and select a customer with a balance.",
                    "Review open account bills and search by receipt when needed.",
                    "Select the specific receipt to pay, enter the received amount, and choose the collection method.",
                    "The payment cannot exceed that receipt's remaining due amount.",
                    "Confirm payment. The POS creates an account-payment receipt and updates the bill and customer balance.",
                    "Use Settlement history to find previous collections and Customer statement PDF to share the account record.",
                ]
            ),
            callout("Payment discipline", "Do not collect an unnamed amount against a walk-in customer. Every account payment must be linked to a saved customer and allocated to one or more open account receipts.", "warning"),
        ]
    )

    add_page(story, "09", "Refunds and returns", "Create an auditable return on today's date without rewriting the original sale or its historical report.")
    story.extend(
        [
            screenshot("10_refunds.png", "Find the original bill by receipt scan/search, date, customer, or product. Refund creation is admin controlled."),
            H2("Why refunds are separate"),
            P("A return made today is a new negative transaction linked to the original bill. The original sale date and amount remain unchanged. Today's reports show the refund, negative profit adjustment, payout method, and returned stock."),
            H2("Create a full or partial refund"),
            steps(
                [
                    "Sign in as an admin or a role with refund permission.",
                    "Open Refunds > Create refund.",
                    "Find the original bill by scanning its receipt code/QR, searching the receipt number, choosing a date range, customer, or product.",
                    "Open the bill and select refundable items and quantities. The POS prevents refunding more than the quantity still eligible.",
                    "Enter a clear refund reason.",
                    "Choose how the refund is paid: Cash, Card, or Account adjustment.",
                    "Review the negative amount, tax, cost/profit adjustment, and stock return, then confirm.",
                ]
            ),
            callout("Cash effect", "A cash refund reduces expected cash for the current register/day. A card refund remains in the card ledger. Account adjustment reduces the customer's due balance and does not remove cash from the drawer.", "info"),
            H2("Refund history"),
            bullets(
                [
                    "Filter by period, receipt, customer, product, or category.",
                    "Open a refund to view original sale date, return date, reason, items, payout method, operator, amount, tax, and profit adjustment.",
                    "Select one or more refund records to print or download a structured refund report.",
                    "Returned physical items are added back to inventory through logged stock movements.",
                ]
            ),
        ]
    )

    add_page(story, "10", "Reports and management review", "Choose a period, inspect live summaries, and download branded PDFs for sales, profit, staff, stock, suppliers, expenses, refunds, and tax.")
    story.extend(
        [
            screenshot("11_reports.png", "Reports overview with period presets, management PDF export, sales pulse, and stock/supplier pulse."),
            H2("Select the reporting period"),
            bullets(
                [
                    "Use Today, Yesterday, This week, This month, This year, or Custom dates.",
                    "The selected period applies to the current report tab and its PDF export.",
                    "Operational reports may include open-day data. Official close reports should be reviewed after the business day is closed.",
                ]
            ),
            H2("Available reports"),
            data_table(
                ["REPORT", "KEY CONTENT"],
                [
                    ["Overview", "Gross sales, net sales, net profit, VAT payable, bill/refund count, top item/customer, inventory and supplier pulse."],
                    ["Sales", "Totals and breakdowns by item, category, customer, payment method, and date."],
                    ["Profit / Loss", "Sales, discounts, refunds, cost of goods, gross profit, expenses, tax view, and net profit."],
                    ["Employees", "Bills, items sold, gross/net sales, refunds, and revenue by cashier/employee."],
                    ["Day / Shift", "Business-day totals, shift opening/closing cash, expected/count difference, and closing history."],
                    ["Inventory", "Stock units, cost value, sales value, low stock, and product detail."],
                    ["Suppliers", "PO totals, received/cancelled/open orders, paid amount, balances, and supplier detail."],
                    ["Expenses / Drawer", "Expense entries, payment breakdown, cash-in/out adjustments, reasons, and operators."],
                    ["Refunds", "Refund amounts and quantities by item, category, customer, date, and payout method."],
                    ["Tax", "Taxable sales, output VAT payable, purchase/input tax where recorded, refunds, and net tax position."],
                ],
                [36 * mm, 133 * mm],
            ),
            callout("Tax note", "Profit and tax are different. VAT collected is a liability, not business income. Profit views may show values before and after tax; follow your accountant's method for official filing.", "warning"),
            H2("PDF quality checklist"),
            bullets(
                [
                    "Confirm shop name, logo, VAT number, period, generated date, and report title.",
                    "Verify that totals agree with the on-screen period before sharing.",
                    "Keep closed-day PDFs as official operational records and use detailed reports for reconciliation.",
                ]
            ),
        ]
    )

    add_page(story, "11", "Settings and permissions", "Configure the shop carefully, restrict sensitive actions by role, and keep recoverable backups.")
    story.extend(
        [
            screenshot("12_settings.png", "Settings keeps shop configuration, Product Trash, users, backup, and support inside one controlled hub."),
            H2("Settings map"),
            data_table(
                ["AREA", "MAIN CONTROLS"],
                [
                    ["Shop settings", "Shop name, logo, address, phone, email, website, currency, VAT number."],
                    ["Day & shift", "Automatic day/shift rollover and related cash-control defaults."],
                    ["Printer", "58mm, 80mm, A4, auto print after sale."],
                    ["Receipt", "Footer, visibility fields, VAT, customer/cashier, second language, receipt size."],
                    ["Tax", "Enabled state, tax name/rate, inclusive/exclusive mode, receipt visibility."],
                    ["Discounts", "Dated promotions by bill/product/service/item and permanent item discounts."],
                    ["Product Trash", "Search/filter deleted items, restore, or admin-only permanent deletion."],
                    ["Users", "Users, roles, permissions, activation/deactivation, password reset."],
                    ["Backup", "Full POS export/import and product spreadsheet template/import/export."],
                    ["Support", "Current license status, masked key, POS owner WhatsApp/email/phone/company details."],
                ],
                [38 * mm, 131 * mm],
            ),
            H2("Users and roles"),
            bullets(
                [
                    "Create one named user per employee. Do not use shared cashier accounts.",
                    "Assign a built-in role or create a role with only the required permissions.",
                    "Sensitive permissions include refunds, product deletion, inventory removal, reports, settings, user administration, data import/export, and day close.",
                    "Deactivate users who leave the business. Reset forgotten passwords without revealing the old password.",
                    "Only an admin or explicitly authorized role should import/export data or restore a backup.",
                ]
            ),
            H2("Product Trash"),
            bullets(
                [
                    "Deleting a product moves it to Trash with who deleted it, when, and why.",
                    "Filter by date, product, category, or search text; use pagination for long histories.",
                    "Restore when the deletion was accidental. Delete forever only when the admin understands the impact on references and storage.",
                ]
            ),
            H2("Backup and import"),
            callout("Cloud is primary", "Store data is synchronized to the shop's protected cloud workspace. Manual export remains useful before major imports or configuration changes. Never edit backup JSON manually unless instructed by support.", "success"),
            bullets(
                [
                    "Download a full backup and store it securely outside the POS device.",
                    "Use the official product/customer spreadsheet templates. Do not rename columns.",
                    "Review validation errors and duplicate warnings before completing an import.",
                    "Do not close the browser while a large import, upload, or backup restore is processing.",
                ]
            ),
        ]
    )

    add_page(story, "12", "Closing procedures", "Close the cashier shift first, reconcile differences, then close the business day after every register is complete.")
    story.extend(
        [
            H2("End a cashier shift"),
            steps(
                [
                    "Stop billing on the device and complete any pending receipt or account collection.",
                    "Open Dashboard > Shift control.",
                    "Count physical cash in the drawer and enter Counted cash.",
                    "Review opening cash, cash sales, cash refunds, cash in, cash out, expenses, expected cash, and the calculated difference.",
                    "Add a note for any shortage/extra and select End shift.",
                    "Clock out from Time Clock when the employee's workday is also finished.",
                ]
            ),
            data_table(
                ["DIFFERENCE", "INTERPRETATION", "ACTION"],
                [
                    ["0.00", "Counted cash equals expected cash.", "Close normally."],
                    ["Positive", "Drawer has extra cash.", "Recount, check unrecorded cash-in/sales, document the reason."],
                    ["Negative", "Drawer is short.", "Recount, review refunds/cash-out/expenses, document and escalate."],
                ],
                [32 * mm, 62 * mm, 75 * mm],
            ),
            H2("Close the business day"),
            steps(
                [
                    "Confirm every device/cashier shift is closed. The day cannot close while a shift remains open.",
                    "Open Dashboard > Day control and review total sales, cash, card, account, refunds, expenses, net sales, and expected cash.",
                    "Enter final counted cash and a closing note.",
                    "Select Close day and download/review the day closing report.",
                ]
            ),
            callout("Automatic rollover", "When enabled by an admin, the POS can close forgotten open shifts with expected cash, close the prior business day, open the new day, and start the user's next shift. Review automated records and correct attendance/notes when needed.", "info"),
        ]
    )

    add_page(story, "13", "Cloud sync, devices, and safe operation", "Protect data and keep multi-device work consistent without creating duplicate or unsynchronized records.")
    story.extend(
        [
            H2("Cloud behavior"),
            bullets(
                [
                    "Each shop is isolated in the cloud. Users, products, bills, inventory, images, settings, and reports belong only to that shop.",
                    "Wait for the Saved indicator before closing a page or device after a change.",
                    "Do not clear browser/app storage while unsent work or a held local cart exists.",
                    "Receipt numbers are assigned centrally to avoid duplicate numbering across devices.",
                    "Owner changes such as lock, expiry, device limit, or forced logout are checked at startup, refresh, and during periodic license validation.",
                ]
            ),
            H2("Multi-device rules"),
            bullets(
                [
                    "One business day is shared by all devices.",
                    "Each active cashier/device opens its own shift. Open shift count cannot exceed the allowed device limit.",
                    "When another device closes a shift or the owner changes the device limit, refresh/sign in again to load the latest state.",
                    "If a stale shift blocks a device, an admin can identify the active employee/device and force-close the correct shift with an audit record.",
                ]
            ),
            H2("When the internet is unstable"),
            callout("Do not guess", "If Create bill, refund, import, payment, or inventory receiving is still processing, do not click repeatedly. Wait, check the result in Bills/History, then retry only if no record exists.", "danger"),
            bullets(
                [
                    "Keep the POS page open and reconnect the network.",
                    "Do not uninstall the app, clear site data, or log the store out while troubleshooting.",
                    "Confirm the last bill number, stock movement, or payment history before repeating an operation.",
                    "Use Settings > Support for current contact channels and provide the shop name, user, time, screen, and error message.",
                ]
            ),
        ]
    )

    add_page(story, "14", "Troubleshooting guide", "Resolve common operating issues safely and know when to stop and contact support.")
    story.extend(
        [
            data_table(
                ["MESSAGE / PROBLEM", "LIKELY CAUSE", "SAFE ACTION"],
                [
                    ["Day not opened", "No business day is active.", "Admin opens Dashboard > Day control."],
                    ["Shift not opened", "Current user has no active shift.", "Start shift and enter actual opening cash."],
                    ["Clock in required", "Attendance for today is missing.", "Capture location/selfie or request authorized admin bypass."],
                    ["Device limit reached", "All allowed devices/shifts are in use.", "Review active shifts/devices; close/remove the correct stale one or contact POS owner."],
                    ["Product key not found", "Wrong, incomplete, deleted, or unsynchronized key.", "Paste the complete key; confirm the store exists in the owner portal and refresh."],
                    ["POS locked / expired / trial ended", "License status blocks operations.", "Contact the POS owner using details on the status screen."],
                    ["Cannot use Account / Pay later", "Walk-in customer or missing saved profile.", "Select/create a named customer with a unique phone number."],
                    ["Discount rejected", "Negative, over 100 percent, or greater than sale value.", "Enter a valid fixed/percentage amount within the allowed limit."],
                    ["Cannot refund item", "No remaining refundable quantity or insufficient role.", "Check refund history and sign in with authorized admin role."],
                    ["Stock not updated", "Receiving/refund still processing or service item used.", "Check inventory movement history and confirm it is a physical product."],
                    ["Print layout wrong", "Paper size/scale mismatch.", "Match Printer settings and browser paper size; disable browser headers/footers."],
                    ["Image upload failed", "Unsupported/oversized file or network issue.", "Use JPG/PNG, recommended dimensions, and retry after reconnecting."],
                    ["Change not visible on another device", "The device has stale state.", "Wait for Saved, then refresh or sign in again on the other device."],
                ],
                [45 * mm, 48 * mm, 76 * mm],
            ),
            H2("Information to send support"),
            bullets(
                [
                    "Shop name and affected user role (never send a password).",
                    "Exact date/time and device/browser or installed app type.",
                    "Page/module and exact error message.",
                    "Receipt, PO, customer, product, shift, or refund reference number where relevant.",
                    "What you expected, what happened, and whether the action appears in history.",
                    "A screenshot that excludes passwords, full product keys, and private customer data unless support specifically requires it.",
                ]
            ),
        ]
    )

    add_page(story, "15", "Daily operator checklists", "Use these short lists at the counter after completing full training.")
    story.extend(
        [
            H2("Opening checklist"),
            data_table(
                ["DONE", "CHECK"],
                [
                    ["[ ]", "Correct shop and user shown; clock-in completed with location and selfie when required."],
                    ["[ ]", "Correct business date and own shift open with counted opening cash."],
                    ["[ ]", "Printer online, correct paper loaded, and test print available."],
                    ["[ ]", "Quick items, product search, and barcode scanner working."],
                ],
                [17 * mm, 152 * mm],
            ),
            H2("Sale checklist"),
            data_table(
                ["DONE", "CHECK"],
                [
                    ["[ ]", "Correct product, quantity, selling price, and item discount."],
                    ["[ ]", "Correct customer selected; named customer required for Pay later."],
                    ["[ ]", "Whole-bill discount, promotion, VAT, and total reviewed."],
                    ["[ ]", "Correct payment method, paid amount, and due amount."],
                    ["[ ]", "Receipt saved before print/share."],
                ],
                [17 * mm, 152 * mm],
            ),
            H2("Closing checklist"),
            data_table(
                ["DONE", "CHECK"],
                [
                    ["[ ]", "Pending carts, held orders, account payments, refunds, and inventory receiving reviewed."],
                    ["[ ]", "Physical cash counted; cash difference reviewed and note added."],
                    ["[ ]", "Own shift closed and clock-out completed."],
                    ["[ ]", "All shifts closed before business day close."],
                    ["[ ]", "Day close totals and PDF reviewed by authorized admin."],
                ],
                [17 * mm, 152 * mm],
            ),
            H2("Admin weekly checklist"),
            bullets(
                [
                    "Review low stock, open POs, supplier balances, customer account dues, and settlement history.",
                    "Review refund activity, product trash, user status, attendance corrections, and unusual cash differences.",
                    "Export key reports and a manual backup before major imports or policy changes, then verify tax, receipt identity, promotion dates, and printer settings.",
                ]
            ),
        ]
    )

    add_page(story, "16", "Glossary and support", "Keep financial and operational terms consistent across the team.")
    story.extend(
        [
            data_table(
                ["TERM", "DEFINITION"],
                [
                    ["Gross sales", "Completed positive sales before refunds."],
                    ["Refunds / returns", "Negative transactions posted on the return date and linked to original bills."],
                    ["Net sales", "Gross sales minus refunds and applicable reductions."],
                    ["Gross profit", "Sales revenue excluding tax minus product cost before operating expenses."],
                    ["Net profit", "Gross profit after refunds, profit adjustments, and recorded expenses."],
                    ["Tax inclusive", "Displayed sale price already includes tax."],
                    ["Tax exclusive", "Tax is added to the pre-tax selling price."],
                    ["Expected cash", "Opening cash plus cash inflows minus cash outflows/refunds."],
                    ["Cash difference", "Counted cash minus expected cash."],
                    ["Reorder level", "Stock threshold that marks a product low stock."],
                    ["PO", "Purchase order sent to one supplier for planned stock."],
                    ["Settlement", "Payment received later against a customer's account bill."],
                    ["Product Trash", "Recoverable area for deleted product/service records."],
                    ["Digital receipt", "Public read-only receipt reached by the unique receipt URL/QR."],
                ],
                [42 * mm, 127 * mm],
            ),
            H2("Support"),
            P("Open Settings > Support / Contact POS Owner to see the current company name, website, WhatsApp, email, call number, masked product key, and license status. These details are managed centrally and may differ from the training screenshots."),
            callout("Security", "Support will never need to know an employee's existing password. Password resets create a new password; support impersonation is time-limited, reason-based, and audited.", "danger"),
            Spacer(1, 18),
            Table(
                [[P("END OF MANUAL", "LabelPOS")], [P("Train with a demo shop, follow permissions, and reconcile every shift before closing the day.", "CoverSubtitle")]],
                colWidths=[169 * mm],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), GREEN_SOFT),
                        ("BOX", (0, 0), (-1, -1), 0.6, MINT),
                        ("LEFTPADDING", (0, 0), (-1, -1), 16),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                        ("TOPPADDING", (0, 0), (-1, -1), 12),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ]
                ),
            ),
        ]
    )

    return story


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREPARED_DIR.mkdir(parents=True, exist_ok=True)
    doc = ManualDocTemplate(str(OUTPUT_PATH))
    doc.multiBuild(build_story())
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
