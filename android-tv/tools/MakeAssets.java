import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/**
 * Genereert het app-icoon en de TV-banner in de krijtbord-stijl van De Fles.
 * Aanroep: java MakeAssets <res-map>
 */
public class MakeAssets {

    static final Color BOARD = new Color(0x2c3e35);
    static final Color CHALK = new Color(0xf2ecdc);
    static final Color ORANGE = new Color(0xf4a259);
    static final Color WOOD = new Color(0x6b4527);

    public static void main(String[] args) throws Exception {
        File res = new File(args.length > 0 ? args[0] : "res");
        banner(new File(res, "drawable/banner.png"));
        icon(new File(res, "mipmap-xxxhdpi/ic_launcher.png"), 192);
        icon(new File(res, "mipmap-xhdpi/ic_launcher.png"), 96);
        System.out.println("Assets gegenereerd in " + res.getAbsolutePath());
    }

    static Graphics2D start(BufferedImage img) {
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        return g;
    }

    static void chalkDust(Graphics2D g, int w, int h) {
        g.setPaint(new RadialGradientPaint(new Point(w / 4, h / 3), Math.max(w, h) / 2f,
                new float[]{0f, 1f},
                new Color[]{new Color(244, 238, 222, 14), new Color(244, 238, 222, 0)}));
        g.fillRect(0, 0, w, h);
    }

    static void banner(File out) throws Exception {
        int w = 320, h = 180;
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = start(img);
        // houten lijst + bord
        g.setColor(WOOD);
        g.fillRect(0, 0, w, h);
        g.setColor(BOARD);
        g.fillRoundRect(7, 7, w - 14, h - 14, 10, 10);
        chalkDust(g, w, h);
        // krijtkader
        g.setColor(new Color(242, 236, 220, 70));
        g.setStroke(new BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 0, new float[]{6, 7}, 0));
        g.drawRoundRect(18, 16, w - 36, h - 32, 10, 10);
        // tekst
        g.setColor(ORANGE);
        g.setFont(new Font("Serif", Font.ITALIC, 22));
        drawCentered(g, "welkom in", w / 2, 58);
        g.setColor(CHALK);
        g.setFont(new Font("Serif", Font.BOLD, 56));
        drawCentered(g, "DE FLES", w / 2, 112);
        g.setColor(new Color(242, 236, 220, 150));
        g.setFont(new Font("SansSerif", Font.PLAIN, 12));
        drawSpaced(g, "BAR · TUINHUIS", w / 2, 140, 4);
        g.dispose();
        write(img, out);
    }

    static void icon(File out, int size) throws Exception {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = start(img);
        float u = size / 192f;
        g.setColor(WOOD);
        g.fillRect(0, 0, size, size);
        g.setColor(BOARD);
        g.fillRoundRect(Math.round(8 * u), Math.round(8 * u), size - Math.round(16 * u), size - Math.round(16 * u), Math.round(14 * u), Math.round(14 * u));
        chalkDust(g, size, size);
        // fles in krijtlijnen
        g.setColor(CHALK);
        g.setStroke(new BasicStroke(7 * u, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        int cx = size / 2;
        int top = Math.round(34 * u), neckW = Math.round(18 * u), bodyW = Math.round(56 * u);
        int shoulder = Math.round(86 * u), bottom = size - Math.round(36 * u);
        g.drawLine(cx - neckW / 2, top, cx - neckW / 2, shoulder - Math.round(18 * u));
        g.drawLine(cx + neckW / 2, top, cx + neckW / 2, shoulder - Math.round(18 * u));
        g.drawLine(cx - neckW / 2, top, cx + neckW / 2, top);
        g.draw(new java.awt.geom.QuadCurve2D.Float(cx - neckW / 2f, shoulder - 18 * u, cx - bodyW / 2f, shoulder - 6 * u, cx - bodyW / 2f, shoulder + 12 * u));
        g.draw(new java.awt.geom.QuadCurve2D.Float(cx + neckW / 2f, shoulder - 18 * u, cx + bodyW / 2f, shoulder - 6 * u, cx + bodyW / 2f, shoulder + 12 * u));
        g.drawLine(cx - bodyW / 2, shoulder + Math.round(12 * u), cx - bodyW / 2, bottom);
        g.drawLine(cx + bodyW / 2, shoulder + Math.round(12 * u), cx + bodyW / 2, bottom);
        g.drawLine(cx - bodyW / 2, bottom, cx + bodyW / 2, bottom);
        // etiketje in oranje
        g.setColor(ORANGE);
        g.setStroke(new BasicStroke(5 * u, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        int ly = Math.round((shoulder + bottom) / 2f);
        g.drawLine(cx - Math.round(16 * u), ly, cx + Math.round(16 * u), ly);
        g.drawLine(cx - Math.round(12 * u), ly + Math.round(14 * u), cx + Math.round(12 * u), ly + Math.round(14 * u));
        g.dispose();
        write(img, out);
    }

    static void drawCentered(Graphics2D g, String s, int cx, int baseline) {
        FontMetrics fm = g.getFontMetrics();
        g.drawString(s, cx - fm.stringWidth(s) / 2, baseline);
    }

    static void drawSpaced(Graphics2D g, String s, int cx, int baseline, int extra) {
        FontMetrics fm = g.getFontMetrics();
        int total = fm.stringWidth(s) + (s.length() - 1) * extra;
        int x = cx - total / 2;
        for (char c : s.toCharArray()) {
            g.drawString(String.valueOf(c), x, baseline);
            x += fm.charWidth(c) + extra;
        }
    }

    static void write(BufferedImage img, File out) throws Exception {
        out.getParentFile().mkdirs();
        ImageIO.write(img, "png", out);
        System.out.println("  " + out.getPath());
    }
}
