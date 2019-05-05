import pywikibot
import pymysql
import os
import re

conn = pymysql.connect(
    host=os.environ['MYSQL_HOST'],
    user=os.environ['MYSQL_USERNAME'],
    password=os.environ['MYSQL_PASSWORD'],
    database='enwiki_p',
    charset='utf8',
)

with conn.cursor() as cur:
    cur.execute('use enwiki_p')
    cur.execute("SELECT CONCAT('[[:Category:', cl_to, ']]'), COUNT(*) FROM categorylinks WHERE cl_from IN (select page_id from page where page_namespace = 118) and cl_to not like '%AfC%' and cl_to not like '%raft%' and cl_to not like '%Pages%' and cl_to not like '%pages%' and cl_to not like '%edirect%' and cl_to not like '%CS1%' and cl_to not like '%deletion%' and cl_to not like '%rticles%' and cl_to not like '%emplate%' and cl_to not like '%with%' and cl_to not like '%tracking%' and cl_to not like '%nfobox%' GROUP BY cl_to ORDER BY COUNT(*) DESC")
    drafts = cur.fetchall()
#    print( drafts )

arred = []
for row in drafts:
    arred.append ( [ str( row[0] ).replace('_', ' '), row[1] ] )
#print( arred )
    
table = '{| class="wikitable sortable" \n ! Category !! Drafts\n'
for row in range( 0, len(arred) ):
    table = table + '|-\n| ' + (str( arred[row][0] )[2:-1]) + ' || ' + str( arred[row][1]) + '\n'

table = table + '|}'
#print( table )

to_save = "Categories that contain pages in the (main) namespace and the draft namespaces; data as of <onlyinclude>~~~~~</onlyinclude>. Updated by ~~~.\n\n" + table

site = pywikibot.Site('en', 'wikipedia')
page = pywikibot.Page(site, 'Wikipedia:Database reports/Polluted categories (2)')
page.text = to_save
#print( to_save )
page.save( summary = 'Task 28: Update database report', minor = False )
